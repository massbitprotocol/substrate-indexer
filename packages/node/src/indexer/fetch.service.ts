import {isRuntimeDataSourceV0_2_0, RuntimeDataSourceV0_0_1} from '@massbit/common';
import {
  SubstrateCallFilter,
  SubstrateEventFilter,
  SubstrateHandlerKind,
  SubstrateHandler,
  SubstrateDatasource,
  SubstrateHandlerFilter,
} from '@massbit/types';
import {OnApplicationShutdown} from '@nestjs/common';
import {EventEmitter2} from '@nestjs/event-emitter';
import {Interval} from '@nestjs/schedule';
import {ApiPromise} from '@polkadot/api';
import {isUndefined, range} from 'lodash';
import Pino from 'pino';
import {NodeConfig} from '../configure/node-config';
import {getLogger} from '../utils/logger';
import {profiler, profilerWrap} from '../utils/profiler';
import {isBaseHandler, isCustomDs, isCustomHandler, isRuntimeDs} from '../utils/project';
import {delay} from '../utils/promise';
import * as SubstrateUtil from '../utils/substrate';
import {getYargsOption} from '../yargs';
import {ApiService} from './api.service';
import {BlockedQueue} from './blocked-queue';
import {Dictionary, DictionaryService} from './dictionary.service';
import {DsProcessorService} from './ds-processor.service';
import {IndexerEvent} from './events';
import {Project} from './project.model';
import {BlockContent, IndexerFilters} from './types';

const BLOCK_TIME_VARIANCE = 5;
const DICTIONARY_MAX_QUERY_SIZE = 10000;
const {argv} = getYargsOption();

const fetchBlocksBatches = argv.profiler
  ? profilerWrap(SubstrateUtil.fetchBlocksBatches, 'SubstrateUtil', 'fetchBlocksBatches')
  : SubstrateUtil.fetchBlocksBatches;

export class FetchService implements OnApplicationShutdown {
  private latestBestHeight: number;
  private latestFinalizedHeight: number;
  private latestProcessedHeight: number;
  private latestBufferedHeight: number;
  private blockBuffer: BlockedQueue<BlockContent>;
  private blockNumberBuffer: BlockedQueue<number>;
  private isShutdown = false;
  private parentSpecVersion: number;
  private useDictionary: boolean;
  private projectIndexFilters: IndexerFilters;
  private readonly project: Project;
  private apiService: ApiService;
  private dsProcessorService: DsProcessorService;
  private nodeConfig: NodeConfig;
  private dictionaryService: DictionaryService;
  private eventEmitter: EventEmitter2;
  private logger: Pino.Logger;

  constructor(
    project: Project,
    nodeConfig: NodeConfig,
    apiService: ApiService,
    dsProcessorService: DsProcessorService,
    dictionaryService: DictionaryService,
    eventEmitter: EventEmitter2
  ) {
    this.nodeConfig = nodeConfig;
    this.project = project;
    this.eventEmitter = eventEmitter;
    this.apiService = apiService;
    this.dictionaryService = dictionaryService;
    this.dsProcessorService = dsProcessorService;
    this.blockBuffer = new BlockedQueue<BlockContent>(this.nodeConfig.batchSize * 3);
    this.blockNumberBuffer = new BlockedQueue<number>(this.nodeConfig.batchSize * 3);
    this.logger = getLogger(`[fetch] [${project.projectManifest.name}]`);
  }

  async init(): Promise<void> {
    this.projectIndexFilters = this.getIndexFilters();
    this.useDictionary = !!this.projectIndexFilters && !!this.project.network.dictionary;

    this.eventEmitter.emit(IndexerEvent.UsingDictionary, {
      value: Number(this.useDictionary),
    });
    await this.getFinalizedBlockHead();
    await this.getBestBlockHead();
  }

  onApplicationShutdown(): void {
    this.isShutdown = true;
  }

  get api(): ApiPromise {
    return this.apiService.getApi();
  }

  getIndexFilters(): IndexerFilters | undefined {
    const eventFilters: SubstrateEventFilter[] = [];
    const extrinsicFilters: SubstrateCallFilter[] = [];
    const dataSources = this.project.dataSources.filter(
      (ds) =>
        isRuntimeDataSourceV0_2_0(ds) ||
        !(ds as RuntimeDataSourceV0_0_1).filter?.specName ||
        (ds as RuntimeDataSourceV0_0_1).filter.specName === this.api.runtimeVersion.specName.toString()
    );
    for (const ds of dataSources) {
      for (const handler of ds.mapping.handlers) {
        const baseHandlerKind = this.getBaseHandlerKind(ds, handler);
        const filterList = isRuntimeDs(ds)
          ? [handler.filter as SubstrateHandlerFilter].filter(Boolean)
          : this.getBaseHandlerFilters<SubstrateHandlerFilter>(ds, handler.kind);
        if (!filterList.length) return;
        switch (baseHandlerKind) {
          case SubstrateHandlerKind.Block:
            return;
          case SubstrateHandlerKind.Call: {
            for (const filter of filterList as SubstrateCallFilter[]) {
              if (
                filter.module !== undefined &&
                filter.method !== undefined &&
                extrinsicFilters.findIndex(
                  (extrinsic) => extrinsic.module === filter.module && extrinsic.method === filter.method
                ) < 0
              ) {
                extrinsicFilters.push(handler.filter);
              } else {
                return;
              }
            }
            break;
          }
          case SubstrateHandlerKind.Event: {
            for (const filter of filterList as SubstrateEventFilter[]) {
              if (
                filter.module !== undefined &&
                filter.method !== undefined &&
                eventFilters.findIndex((event) => event.module === filter.module && event.method === filter.method) < 0
              ) {
                eventFilters.push(handler.filter);
              } else {
                return;
              }
            }
            break;
          }
          default:
        }
      }
    }
    return {eventFilters, extrinsicFilters};
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
  async getFinalizedBlockHead() {
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
  async getBestBlockHead() {
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
      if (
        this.blockNumberBuffer.freeSize < this.nodeConfig.batchSize ||
        startBlockHeight > this.latestFinalizedHeight
      ) {
        await delay(1);
        continue;
      }
      if (this.useDictionary) {
        const queryEndBlock = startBlockHeight + DICTIONARY_MAX_QUERY_SIZE;
        try {
          const dictionary = await this.dictionaryService.getDictionary(
            startBlockHeight,
            queryEndBlock,
            this.nodeConfig.batchSize,
            this.projectIndexFilters
          );
          //TODO
          // const specVersionMap = dictionary.specVersions;
          if (dictionary && this.dictionaryValidation(dictionary, startBlockHeight)) {
            const {batchBlocks} = dictionary;
            if (batchBlocks.length === 0) {
              this.setLatestBufferedHeight(Math.min(queryEndBlock - 1, dictionary._metadata.lastProcessedHeight));
            } else {
              this.blockNumberBuffer.putAll(batchBlocks);
              this.setLatestBufferedHeight(batchBlocks[batchBlocks.length - 1]);
            }
            this.eventEmitter.emit(IndexerEvent.BlocknumberQueueSize, {
              value: this.blockNumberBuffer.size,
            });
            continue; // skip nextBlockRange() way
          }
          // else use this.nextBlockRange()
        } catch (e) {
          this.logger.debug(`Fetch dictionary stopped: ${e.message}`);
          this.eventEmitter.emit(IndexerEvent.SkipDictionary);
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
      const takeCount = Math.min(this.blockBuffer.freeSize, this.nodeConfig.batchSize);

      if (this.blockNumberBuffer.size === 0 || takeCount === 0) {
        await delay(1);
        continue;
      }

      const bufferBlocks = await this.blockNumberBuffer.takeAll(takeCount);
      const metadataChanged = await this.fetchMeta(bufferBlocks[bufferBlocks.length - 1]);
      const blocks = await fetchBlocksBatches(
        this.api,
        bufferBlocks,
        metadataChanged ? undefined : this.parentSpecVersion
      );
      this.logger.info(
        `fetch block [${bufferBlocks[0]},${bufferBlocks[bufferBlocks.length - 1]}], total ${bufferBlocks.length} blocks`
      );
      this.blockBuffer.putAll(blocks);
      this.eventEmitter.emit(IndexerEvent.BlockQueueSize, {
        value: this.blockBuffer.size,
      });
    }
  }

  @profiler(argv.profiler)
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
    let endBlockHeight = startBlockHeight + this.nodeConfig.batchSize - 1;
    if (endBlockHeight > this.latestFinalizedHeight) {
      endBlockHeight = this.latestFinalizedHeight;
    }
    return endBlockHeight;
  }

  private dictionaryValidation({_metadata: metaData}: Dictionary, startBlockHeight: number): boolean {
    if (metaData.genesisHash !== this.api.genesisHash.toString()) {
      this.logger.warn(`Dictionary is disabled since now`);
      this.useDictionary = false;
      this.eventEmitter.emit(IndexerEvent.UsingDictionary, {
        value: Number(this.useDictionary),
      });
      this.eventEmitter.emit(IndexerEvent.SkipDictionary);
      return false;
    }
    if (metaData.lastProcessedHeight < startBlockHeight) {
      this.logger.warn(`Dictionary indexed block is behind current indexing block height`);
      this.eventEmitter.emit(IndexerEvent.SkipDictionary);
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

  private getBaseHandlerKind(ds: SubstrateDatasource, handler: SubstrateHandler): SubstrateHandlerKind {
    if (isRuntimeDs(ds) && isBaseHandler(handler)) {
      return handler.kind;
    } else if (isCustomDs(ds) && isCustomHandler(handler)) {
      const plugin = this.dsProcessorService.getDsProcessor(ds);
      const baseHandler = plugin.handlerProcessors[handler.kind]?.baseHandlerKind;
      if (!baseHandler) {
        throw new Error(`handler type ${handler.kind} not found in processor for ${ds.kind}`);
      }
      return baseHandler;
    }
  }

  private getBaseHandlerFilters<T extends SubstrateHandlerFilter>(ds: SubstrateDatasource, handlerKind: string): T[] {
    if (isCustomDs(ds)) {
      const plugin = this.dsProcessorService.getDsProcessor(ds);
      const processor = plugin.handlerProcessors[handlerKind];
      return processor.baseFilter instanceof Array ? (processor.baseFilter as T[]) : ([processor.baseFilter] as T[]);
    } else {
      throw new Error(`expect custom datasource here`);
    }
  }
}
