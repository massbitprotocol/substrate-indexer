import {isRuntimeDataSourceV0_0_2, delay, Project, RuntimeDataSourceV0_0_1} from '@massbit/common';
import {SubstrateCallFilter, SubstrateEventFilter, SubstrateHandlerKind, SubstrateHandlerFilter} from '@massbit/types';
import {OnApplicationShutdown} from '@nestjs/common';
import {EventEmitter2} from '@nestjs/event-emitter';
import {Interval} from '@nestjs/schedule';
import {ApiPromise} from '@polkadot/api';
import {isUndefined, range, sortBy, uniqBy} from 'lodash';
import Pino from 'pino';
import {Config} from '../configure/config';
import {getLogger} from '../utils/logger';
import * as SubstrateUtil from '../utils/substrate';
import {ApiService} from './api.service';
import {BlockedQueue} from './blocked-queue';
import {IndexerEvent} from './events';
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
  private latestBestHeight: number;
  private latestFinalizedHeight: number;
  private latestProcessedHeight: number;
  private latestBufferedHeight: number;
  private blockBuffer: BlockedQueue<BlockContent>;
  private blockNumberBuffer: BlockedQueue<number>;
  private isShutdown = false;
  private parentSpecVersion: number;
  private useNetworkIndexer: boolean;
  private networkIndexerQueryEntries?: NetworkIndexerQueryEntry[];
  private readonly project: Project;
  private apiService: ApiService;
  private config: Config;
  private networkIndexerService: NetworkIndexerService;
  private eventEmitter: EventEmitter2;
  private logger: Pino.Logger;

  constructor(
    project: Project,
    config: Config,
    apiService: ApiService,
    networkIndexerService: NetworkIndexerService,
    eventEmitter: EventEmitter2
  ) {
    this.config = config;
    this.project = project;
    this.eventEmitter = eventEmitter;
    this.apiService = apiService;
    this.networkIndexerService = networkIndexerService;
    this.blockBuffer = new BlockedQueue<BlockContent>(this.config.batchSize * 3);
    this.blockNumberBuffer = new BlockedQueue<number>(this.config.batchSize * 3);
    this.logger = getLogger(project.manifest.name);
  }

  async init(): Promise<void> {
    this.networkIndexerQueryEntries = this.getDictionaryQueryEntries();
    this.useNetworkIndexer = !!this.networkIndexerQueryEntries?.length && !!this.project.network.networkIndexer;
    await this.getFinalizedBlockHead();
    await this.getBestBlockHead();
  }

  onApplicationShutdown(): void {
    this.isShutdown = true;
  }

  get api(): ApiPromise {
    return this.apiService.getApi();
  }

  getDictionaryQueryEntries(): NetworkIndexerQueryEntry[] {
    const queryEntries: NetworkIndexerQueryEntry[] = [];

    const dataSources = this.project.dataSources.filter(
      (ds) =>
        isRuntimeDataSourceV0_0_2(ds) ||
        !(ds as RuntimeDataSourceV0_0_1).filter?.specName ||
        (ds as RuntimeDataSourceV0_0_1).filter.specName === this.api.runtimeVersion.specName.toString()
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
    let stopper = false;
    void (async () => {
      while (!stopper) {
        const block = await this.blockBuffer.take();
        this.eventEmitter.emit(IndexerEvent.BlockQueueSize, {
          value: this.blockBuffer.size,
        });
        let success = false;
        while (!success) {
          try {
            await next(block);
            success = true;
          } catch (e) {
            this.logger.error(
              e,
              `failed to index block at height ${block.block.block.header.number.toString()} ${
                e.handler ? `${e.handler}(${e.handlerArgs ?? ''})` : ''
              }`
            );
            process.exit(1);
          }
        }
      }
    })();
    return () => (stopper = true);
  }

  @Interval(BLOCK_TIME_VARIANCE * 1000)
  async getFinalizedBlockHead(): Promise<void> {
    if (!this.api) {
      this.logger.debug(`Skip fetch finalized block until API is ready`);
      return;
    }
    try {
      const finalizedHead = await this.api.rpc.chain.getFinalizedHead();
      const finalizedBlock = await this.api.rpc.chain.getBlock(finalizedHead);
      const currentFinalizedHeight = finalizedBlock.block.header.number.toNumber();
      if (this.latestFinalizedHeight !== currentFinalizedHeight) {
        this.latestFinalizedHeight = currentFinalizedHeight;
        this.eventEmitter.emit(IndexerEvent.BlockTarget, {
          height: this.latestFinalizedHeight,
        });
      }
    } catch (e) {
      this.logger.error(e, `Having a problem when get finalized block`);
    }
  }

  @Interval(BLOCK_TIME_VARIANCE * 1000)
  async getBestBlockHead(): Promise<void> {
    if (!this.api) {
      this.logger.debug(`Skip fetch best block until API is ready`);
      return;
    }
    try {
      const bestHeader = await this.api.rpc.chain.getHeader();
      const currentBestHeight = bestHeader.number.toNumber();
      if (this.latestBestHeight !== currentBestHeight) {
        this.latestBestHeight = currentBestHeight;
        this.eventEmitter.emit(IndexerEvent.BlockBest, {
          height: this.latestBestHeight,
        });
      }
    } catch (e) {
      this.logger.error(e, `Having a problem when get best block`);
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

    while (!this.isShutdown) {
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
              this.blockNumberBuffer.putAll(batchBlocks);
              this.setLatestBufferedHeight(batchBlocks[batchBlocks.length - 1]);
            }
            this.eventEmitter.emit(IndexerEvent.BlocknumberQueueSize, {
              value: this.blockNumberBuffer.size,
            });
            continue; // skip nextBlockRange() way
          }
        } catch (e) {
          this.logger.debug(`fetch network indexer stopped: ${e.message}`);
        }
      }
      // the original method: fill next batch size of blocks
      const endHeight = this.nextEndBlockHeight(startBlockHeight);
      this.blockNumberBuffer.putAll(range(startBlockHeight, endHeight + 1));
      this.setLatestBufferedHeight(endHeight);
    }
  }

  async fillBlockBuffer(): Promise<void> {
    while (!this.isShutdown) {
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
        `fetch block in range [${bufferBlocks[0]},${bufferBlocks[bufferBlocks.length - 1]}], total ${
          bufferBlocks.length
        } blocks`
      );
      this.blockBuffer.putAll(blocks);
      this.eventEmitter.emit(IndexerEvent.BlockQueueSize, {
        value: this.blockBuffer.size,
      });
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
    this.eventEmitter.emit(IndexerEvent.BlocknumberQueueSize, {
      value: this.blockNumberBuffer.size,
    });
  }
}
