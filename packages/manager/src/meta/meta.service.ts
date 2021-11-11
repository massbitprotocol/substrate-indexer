import {Injectable} from '@nestjs/common';
import {OnEvent} from '@nestjs/event-emitter';
import {
  BestBlockPayload,
  EventPayload,
  IndexerEvent,
  NetworkMetadataPayload,
  ProcessBlockPayload,
  TargetBlockPayload,
} from '../indexer/events';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {version: polkadotSdkVersion} = require('@polkadot/api/package.json');
const {version: packageVersion} = require('../../package.json');

@Injectable()
export class MetaService {
  private currentProcessingHeight: number;
  private currentProcessingTimestamp: number;
  private bestHeight: number;
  private targetHeight: number;
  private networkMeta: NetworkMetadataPayload;
  private apiConnected: boolean;
  private injectedApiConnected: boolean;
  private lastProcessedHeight: number;
  private lastProcessedTimestamp: number;

  getMeta() {
    return {
      currentProcessingHeight: this.currentProcessingHeight,
      currentProcessingTimestamp: this.currentProcessingTimestamp,
      targetHeight: this.targetHeight,
      bestHeight: this.bestHeight,
      indexerNodeVersion: packageVersion,
      lastProcessedHeight: this.lastProcessedHeight,
      lastProcessedTimestamp: this.lastProcessedTimestamp,
      uptime: process.uptime(),
      polkadotSdkVersion,
      apiConnected: this.apiConnected,
      injectedApiConnected: this.injectedApiConnected,
      ...this.networkMeta,
    };
  }

  @OnEvent(IndexerEvent.BlockProcessing)
  handleProcessingBlock(blockPayload: ProcessBlockPayload): void {
    this.currentProcessingHeight = blockPayload.height;
    this.currentProcessingTimestamp = blockPayload.timestamp;
  }

  @OnEvent(IndexerEvent.BlockLastProcessed)
  handleLastProcessedBlock(blockPayload: ProcessBlockPayload): void {
    this.lastProcessedHeight = blockPayload.height;
    this.lastProcessedTimestamp = blockPayload.timestamp;
  }

  @OnEvent(IndexerEvent.BlockTarget)
  handleTargetBlock(blockPayload: TargetBlockPayload): void {
    this.targetHeight = blockPayload.height;
  }

  @OnEvent(IndexerEvent.BlockBest)
  handleBestBlock(blockPayload: BestBlockPayload): void {
    this.bestHeight = blockPayload.height;
  }

  @OnEvent(IndexerEvent.NetworkMetadata)
  handleNetworkMetadata(networkMeta: NetworkMetadataPayload): void {
    this.networkMeta = networkMeta;
  }

  @OnEvent(IndexerEvent.ApiConnected)
  handleApiConnected({value}: EventPayload<number>): void {
    this.apiConnected = !!value;
  }

  @OnEvent(IndexerEvent.InjectedApiConnected)
  handleInjectedApiConnected({value}: EventPayload<number>): void {
    this.injectedApiConnected = !!value;
  }
}
