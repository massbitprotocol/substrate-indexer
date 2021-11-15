import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Config } from '../configure/config';
import {
  IndexerEvent,
  ProcessBlockPayload,
  TargetBlockPayload,
} from '../indexer/events';

const DEFAULT_TIMEOUT = 900000;

@Injectable()
export class HealthService {
  private recordBlockHeight?: number;
  private recordBlockTimestamp?: number;
  private currentProcessingHeight?: number;
  private currentProcessingTimestamp?: number;
  private blockTime = 6000;
  private readonly healthTimeout: number;

  constructor(protected nodeConfig: Config) {
    this.healthTimeout = Math.max(
      DEFAULT_TIMEOUT,
      this.nodeConfig.timeout * 1000,
    );
  }

  @OnEvent(IndexerEvent.BlockTarget)
  handleTargetBlock(blockPayload: TargetBlockPayload): void {
    if (this.recordBlockHeight !== blockPayload.height) {
      this.recordBlockHeight = blockPayload.height;
      this.recordBlockTimestamp = Date.now();
    }
  }

  @OnEvent(IndexerEvent.BlockProcessing)
  handleProcessingBlock(blockPayload: ProcessBlockPayload): void {
    if (this.currentProcessingHeight !== blockPayload.height) {
      this.currentProcessingHeight = blockPayload.height;
      this.currentProcessingTimestamp = blockPayload.timestamp;
    }
  }

  getHealth(): void {
    if (
      this.recordBlockTimestamp &&
      Date.now() - this.recordBlockTimestamp > this.blockTime * 10
    ) {
      throw new Error('Endpoint is not healthy');
    }
    if (
      this.currentProcessingTimestamp &&
      Date.now() - this.currentProcessingTimestamp > this.healthTimeout
    ) {
      throw new Error('Indexer is not healthy');
    }
  }
}
