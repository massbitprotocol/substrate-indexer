import {OnEvent} from '@nestjs/event-emitter';
import {InjectMetric} from '@willsoto/nestjs-prometheus';
import {Gauge} from 'prom-client';
import {BestBlockPayload, EventPayload, IndexerEvent, ProcessBlockPayload, TargetBlockPayload} from '../indexer/events';

export class MetricEventListener {
  constructor(
    @InjectMetric('substrate_indexer_api_connected')
    private apiConnectedMetric: Gauge<string>,
    @InjectMetric('substrate_indexer_injected_api_connected')
    private injectedApiConnectedMetric: Gauge<string>,
    @InjectMetric('substrate_indexer_block_queue_size')
    private blockQueueSizeMetric: Gauge<string>,
    @InjectMetric('substrate_indexer_blocknumber_queue_size')
    private blocknumberQueueSizeMetric: Gauge<string>,
    @InjectMetric('substrate_indexer_processing_block_height')
    private processingBlockHeight: Gauge<string>,
    @InjectMetric('substrate_indexer_processed_block_height')
    private processedBlockHeight: Gauge<string>,
    @InjectMetric('substrate_indexer_target_block_height')
    private targetHeightMetric: Gauge<string>,
    @InjectMetric('substrate_indexer_best_block_height')
    private bestHeightMetric: Gauge<string>
  ) {}

  @OnEvent(IndexerEvent.ApiConnected)
  handleApiConnected({value}: EventPayload<number>): void {
    this.apiConnectedMetric.set(value);
  }

  @OnEvent(IndexerEvent.InjectedApiConnected)
  handleInjectedApiConnected({value}: EventPayload<number>): void {
    this.injectedApiConnectedMetric.set(value);
  }

  @OnEvent(IndexerEvent.BlockQueueSize)
  handleBlockQueueSizeMetric({value}: EventPayload<number>): void {
    this.blockQueueSizeMetric.set(value);
  }

  @OnEvent(IndexerEvent.BlocknumberQueueSize)
  handleBlocknumberQueueSizeMetric({value}: EventPayload<number>): void {
    this.blocknumberQueueSizeMetric.set(value);
  }

  @OnEvent(IndexerEvent.BlockProcessing)
  handleProcessingBlock(blockPayload: ProcessBlockPayload): void {
    this.processingBlockHeight.set(blockPayload.height);
  }

  @OnEvent(IndexerEvent.BlockLastProcessed)
  handleProcessedBlock(blockPayload: ProcessBlockPayload): void {
    this.processedBlockHeight.set(blockPayload.height);
  }

  @OnEvent(IndexerEvent.BlockTarget)
  handleTargetBlock(blockPayload: TargetBlockPayload): void {
    this.targetHeightMetric.set(blockPayload.height);
  }

  @OnEvent(IndexerEvent.BlockBest)
  handleBestBlock(blockPayload: BestBlockPayload): void {
    this.bestHeightMetric.set(blockPayload.height);
  }
}
