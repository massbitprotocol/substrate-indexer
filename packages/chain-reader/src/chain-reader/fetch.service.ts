import {delay} from '@massbit/common';
import {Injectable, OnApplicationShutdown} from '@nestjs/common';
import {Interval} from '@nestjs/schedule';
import {ApiPromise} from '@polkadot/api';
import {isUndefined, range} from 'lodash';
import {NodeConfig} from '../configure/node-config';
import {getLogger} from '../utils/logger';
import * as SubstrateUtil from '../utils/substrate';
import {ApiService} from './api.service';
import {BlockedQueue} from './queue';
import {BlockContent} from './types';

const BLOCK_TIME_VARIANCE = 5;
const logger = getLogger('fetch');

@Injectable()
export class FetchService implements OnApplicationShutdown {
  private latestBestHeight: number;
  private latestFinalizedHeight: number;
  private latestProcessedHeight: number;
  private latestBufferedHeight: number;
  private blockBuffer: BlockedQueue<BlockContent>;
  private blockNumberBuffer: BlockedQueue<number>;
  private isShutdown = false;
  private parentSpecVersion: number;

  constructor(private apiService: ApiService, private nodeConfig: NodeConfig) {
    this.blockBuffer = new BlockedQueue<BlockContent>(this.nodeConfig.batchSize * 3);
    this.blockNumberBuffer = new BlockedQueue<number>(this.nodeConfig.batchSize * 3);
  }

  onApplicationShutdown(): void {
    this.isShutdown = true;
  }

  get api(): ApiPromise {
    return this.apiService.getApi();
  }

  async init(): Promise<void> {
    await this.getFinalizedBlockHead();
    await this.getBestBlockHead();
  }

  register(next: (value: BlockContent) => Promise<void>): () => void {
    let stopper = false;
    void (async () => {
      while (!stopper) {
        const block = await this.blockBuffer.take();
        let success = false;
        while (!success) {
          try {
            await next(block);
            success = true;
          } catch (e) {
            logger.error(
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
      const blocks = await SubstrateUtil.fetchBlocksBatches(
        this.api,
        bufferBlocks,
        metadataChanged ? undefined : this.parentSpecVersion
      );
      logger.info(
        `fetch block [${bufferBlocks[0]},${bufferBlocks[bufferBlocks.length - 1]}], total ${bufferBlocks.length} blocks`
      );
      this.blockBuffer.putAll(blocks);
    }
  }

  private nextEndBlockHeight(startBlockHeight: number): number {
    let endBlockHeight = startBlockHeight + this.nodeConfig.batchSize - 1;
    if (endBlockHeight > this.latestFinalizedHeight) {
      endBlockHeight = this.latestFinalizedHeight;
    }
    return endBlockHeight;
  }

  private setLatestBufferedHeight(height: number): void {
    this.latestBufferedHeight = height;
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

  @Interval(BLOCK_TIME_VARIANCE * 1000)
  async getFinalizedBlockHead(): Promise<void> {
    if (!this.api) {
      logger.debug(`Skip fetch finalized block until API is ready`);
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
      logger.error(e, `Having a problem when get finalized block`);
    }
  }

  @Interval(BLOCK_TIME_VARIANCE * 1000)
  async getBestBlockHead(): Promise<void> {
    if (!this.api) {
      logger.debug(`Skip fetch best block until API is ready`);
      return;
    }
    try {
      const bestHeader = await this.api.rpc.chain.getHeader();
      const currentBestHeight = bestHeader.number.toNumber();
      if (this.latestBestHeight !== currentBestHeight) {
        this.latestBestHeight = currentBestHeight;
      }
    } catch (e) {
      logger.error(e, `Having a problem when get best block`);
    }
  }
}
