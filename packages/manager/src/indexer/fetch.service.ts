import {delay, Project, IRuntimeDataSourceV0_0_1, BlockedQueue} from '@massbit/common';
import {SubstrateCallFilter, SubstrateEventFilter, SubstrateHandlerKind, SubstrateHandlerFilter} from '@massbit/types';
import {OnApplicationShutdown} from '@nestjs/common';
import {EventEmitter2} from '@nestjs/event-emitter';
import {SchedulerRegistry} from '@nestjs/schedule';
import {ApiPromise} from '@polkadot/api';
import {isUndefined, range, sortBy, uniqBy} from 'lodash';
import Pino from 'pino';
import {Config} from '../configure/config';
import {getLogger} from '../utils/logger';
import * as SubstrateUtil from '../utils/substrate';
import {ApiService} from './api.service';
import {NetworkIndexerQueryEntry, NetworkIndexer, NetworkIndexerService} from './network-indexer.service';
import {BlockContent} from './types';

const BLOCK_TIME_VARIANCE = 5;
const NETWORK_INDEXER_MAX_QUERY_SIZE = 10000;

function eventFilterToQueryEntry(filter: SubstrateEventFilter): NetworkIndexerQueryEntry {
  return {
    entity: 'events',
    conditions: [
      {field: 'module', value: filter.module},
      {
        field: 'event',
        value: filter.method,
      },
    ],
  };
}

function callFilterToQueryEntry(filter: SubstrateCallFilter): NetworkIndexerQueryEntry {
  return {
    entity: 'extrinsics',
    conditions: [
      {field: 'module', value: filter.module},
      {
        field: 'call',
        value: filter.method,
      },
    ],
  };
}

export class FetchService implements OnApplicationShutdown {
  private readonly indexerId: string;
  private latestBestHeight: number;
  private latestFinalizedHeight: number;
  private latestProcessedHeight: number;
  private latestBufferedHeight: number;
  private blockBuffer: BlockedQueue<BlockContent>;
  private blockNumberBuffer: BlockedQueue<number>;
  private parentSpecVersion: number;
  private useNetworkIndexer: boolean;
  private networkIndexerQueryEntries?: NetworkIndexerQueryEntry[];
  private readonly project: Project;
  private apiService: ApiService;
  private config: Config;
  private networkIndexerService: NetworkIndexerService;
  private eventEmitter: EventEmitter2;
  private logger: Pino.Logger;
  private schedulerRegistry: SchedulerRegistry;
  private stopper: boolean;

  constructor(
    indexerId: string,
    project: Project,
    config: Config,
    apiService: ApiService,
    networkIndexerService: NetworkIndexerService,
    eventEmitter: EventEmitter2,
    schedulerRegistry: SchedulerRegistry
  ) {
    this.indexerId = indexerId;
    this.project = project;
    this.config = config;
    this.eventEmitter = eventEmitter;
    this.schedulerRegistry = schedulerRegistry;
    this.apiService = apiService;
    this.networkIndexerService = networkIndexerService;
    this.blockBuffer = new BlockedQueue<BlockContent>(this.config.batchSize * 3);
    this.blockNumberBuffer = new BlockedQueue<number>(this.config.batchSize * 3);
    this.logger = getLogger(project.manifest.name);
    this.stopper = false;

    this.addGetFinalizedBlockHeadInterval();
    this.addGetBestBlockHeadInterval();
  }

  async init(): Promise<void> {
    this.networkIndexerQueryEntries = this.getNetworkIndexerQueryEntries();
    this.useNetworkIndexer = !!this.networkIndexerQueryEntries?.length && !!this.project.network.networkIndexer;
    await this.getFinalizedBlockHead();
    await this.getBestBlockHead();
  }

  onApplicationShutdown(): void {
    this.stopper = true;
  }

  get api(): ApiPromise {
    return this.apiService.getApi();
  }

  getNetworkIndexerQueryEntries(): NetworkIndexerQueryEntry[] {
    const queryEntries: NetworkIndexerQueryEntry[] = [];

    const dataSources = this.project.dataSources.filter(
      (ds) =>
        !(ds as IRuntimeDataSourceV0_0_1).filter?.specName ||
        (ds as IRuntimeDataSourceV0_0_1).filter.specName === this.api.runtimeVersion.specName.toString()
    );
    for (const ds of dataSources) {
      for (const handler of ds.mapping.handlers) {
        const baseHandlerKind = handler.kind;
        const filterList = [handler.filter as SubstrateHandlerFilter].filter(Boolean);
        if (!filterList.length) return [];
        switch (baseHandlerKind) {
          case SubstrateHandlerKind.Block:
            return [];
          case SubstrateHandlerKind.Call: {
            for (const filter of filterList as SubstrateCallFilter[]) {
              if (filter.module !== undefined && filter.method !== undefined) {
                queryEntries.push(callFilterToQueryEntry(filter));
              } else {
                return [];
              }
            }
            break;
          }
          case SubstrateHandlerKind.Event: {
            for (const filter of filterList as SubstrateEventFilter[]) {
              if (filter.module !== undefined && filter.method !== undefined) {
                queryEntries.push(eventFilterToQueryEntry(filter));
              } else {
                return [];
              }
            }
            break;
          }
          default:
        }
      }
    }

    return uniqBy(queryEntries, (item) => `${item.entity}|${JSON.stringify(sortBy(item.conditions, (c) => c.field))}`);
  }

  register(next: (value: BlockContent) => Promise<void>): () => void {
    void (async () => {
      while (!this.stopper) {
        const block = await this.blockBuffer.take();
        let success = false;
        while (!success) {
          try {
            await next(block);
            success = true;
          } catch (e) {
            this.logger.error(
              e,
              `index block at height ${block.block.block.header.number.toString()} ${
                e.handler ? `${e.handler}(${e.handlerArgs ?? ''})` : ''
              }`
            );
          }
        }
      }
    })();
    return () => (this.stopper = true);
  }

  async getFinalizedBlockHead(): Promise<void> {
    if (!this.api) {
      this.logger.debug(`skip fetch finalized block until API is ready`);
      return;
    }
    try {
      const finalizedHead = await this.api.rpc.chain.getFinalizedHead();
      const finalizedBlock = await this.api.rpc.chain.getBlock(finalizedHead);
      const currentFinalizedHeight = finalizedBlock.block.header.number.toNumber();
      if (this.latestFinalizedHeight !== currentFinalizedHeight) {
        this.latestFinalizedHeight = currentFinalizedHeight;
      }
    } catch (e) {
      this.logger.error(e, `get finalized block`);
    }
  }

  async getBestBlockHead(): Promise<void> {
    if (!this.api) {
      this.logger.debug(`skip fetch best block until API is ready`);
      return;
    }
    try {
      const bestHeader = await this.api.rpc.chain.getHeader();
      const currentBestHeight = bestHeader.number.toNumber();
      if (this.latestBestHeight !== currentBestHeight) {
        this.latestBestHeight = currentBestHeight;
      }
    } catch (e) {
      this.logger.error(e, `get best block`);
    }
  }

  latestProcessed(height: number): void {
    this.latestProcessedHeight = height;
  }

  async startLoop(initBlockHeight: number): Promise<void> {
    if (isUndefined(this.latestProcessedHeight)) {
      this.latestProcessedHeight = initBlockHeight - 1;
    }
    await Promise.all([this.fillNextBlockBuffer(initBlockHeight), this.fillBlockBuffer()]);
  }

  async fillNextBlockBuffer(initBlockHeight: number): Promise<void> {
    await this.fetchMeta(initBlockHeight);

    let startBlockHeight: number;

    while (!this.stopper) {
      startBlockHeight = this.latestBufferedHeight ? this.latestBufferedHeight + 1 : initBlockHeight;
      if (this.blockNumberBuffer.freeSize < this.config.batchSize || startBlockHeight > this.latestFinalizedHeight) {
        await delay(1);
        continue;
      }
      if (this.useNetworkIndexer) {
        const queryEndBlock = startBlockHeight + NETWORK_INDEXER_MAX_QUERY_SIZE;
        try {
          const networkIndexer = await this.networkIndexerService.getNetworkIndexer(
            startBlockHeight,
            queryEndBlock,
            this.config.batchSize,
            this.networkIndexerQueryEntries
          );
          if (networkIndexer && this.validateNetworkIndexer(networkIndexer, startBlockHeight)) {
            const {batchBlocks} = networkIndexer;
            if (batchBlocks.length === 0) {
              this.setLatestBufferedHeight(Math.min(queryEndBlock - 1, networkIndexer._metadata.lastProcessedHeight));
            } else {
              await this.blockNumberBuffer.putAll(batchBlocks);
              this.setLatestBufferedHeight(batchBlocks[batchBlocks.length - 1]);
            }
            continue; // skip nextBlockRange() way
          }
        } catch (e) {
          this.logger.debug(`fetch network indexer stopped: ${e.message}`);
        }
      }
      // the original method: fill next batch size of blocks
      const endHeight = this.nextEndBlockHeight(startBlockHeight);
      await this.blockNumberBuffer.putAll(range(startBlockHeight, endHeight + 1));
      this.setLatestBufferedHeight(endHeight);
    }
  }

  async fillBlockBuffer(): Promise<void> {
    while (!this.stopper) {
      const takeCount = Math.min(this.blockBuffer.freeSize, this.config.batchSize);

      if (this.blockNumberBuffer.size === 0 || takeCount === 0) {
        await delay(1);
        continue;
      }

      const bufferBlocks = await this.blockNumberBuffer.takeAll(takeCount);
      const metadataChanged = await this.fetchMeta(bufferBlocks[bufferBlocks.length - 1]);
      const blocks = await SubstrateUtil.fetchBlocksBatches(
        this.api,
        bufferBlocks,
        metadataChanged ? undefined : this.parentSpecVersion
      );
      this.logger.info(
        `index block in range [${bufferBlocks[0]},${bufferBlocks[bufferBlocks.length - 1]}], total ${
          bufferBlocks.length
        } blocks`
      );
      await this.blockBuffer.putAll(blocks);
    }
  }

  async fetchMeta(height: number): Promise<boolean> {
    const parentBlockHash = await this.api.rpc.chain.getBlockHash(Math.max(height - 1, 0));
    const runtimeVersion = await this.api.rpc.state.getRuntimeVersion(parentBlockHash);
    const specVersion = runtimeVersion.specVersion.toNumber();
    if (this.parentSpecVersion !== specVersion) {
      const blockHash = await this.api.rpc.chain.getBlockHash(height);
      await SubstrateUtil.prefetchMetadata(this.api, blockHash);
      this.parentSpecVersion = specVersion;
      return true;
    }
    return false;
  }

  private nextEndBlockHeight(startBlockHeight: number): number {
    let endBlockHeight = startBlockHeight + this.config.batchSize - 1;
    if (endBlockHeight > this.latestFinalizedHeight) {
      endBlockHeight = this.latestFinalizedHeight;
    }
    return endBlockHeight;
  }

  private validateNetworkIndexer({_metadata: metaData}: NetworkIndexer, startBlockHeight: number): boolean {
    if (metaData.genesisHash !== this.api.genesisHash.toString()) {
      this.logger.warn(`Network Indexer is disabled`);
      this.useNetworkIndexer = false;
      return false;
    }
    if (metaData.lastProcessedHeight < startBlockHeight) {
      this.logger.warn(`Network Indexer indexed block is behind current indexing block height`);
      return false;
    }
    return true;
  }

  private setLatestBufferedHeight(height: number): void {
    this.latestBufferedHeight = height;
  }

  private addGetFinalizedBlockHeadInterval(): void {
    const interval = setInterval(() => {
      void this.getFinalizedBlockHead();
    }, BLOCK_TIME_VARIANCE * 1000);
    this.schedulerRegistry.addInterval(`${this.indexerId}_getFinalizedBlockHead`, interval);
  }

  private addGetBestBlockHeadInterval(): void {
    const interval = setInterval(() => {
      void this.getBestBlockHead();
    }, BLOCK_TIME_VARIANCE * 1000);
    this.schedulerRegistry.addInterval(`${this.indexerId}_getBestBlockHead`, interval);
  }

  stop(): void {
    this.stopper = true;
    this.schedulerRegistry.deleteInterval(`${this.indexerId}_getFinalizedBlockHead`);
    this.schedulerRegistry.deleteInterval(`${this.indexerId}_getBestBlockHead`);
    this.logger.info('indexer stopped');
  }
}
