export enum IndexerEvent {
  IndexerDeployed = 'indexer_deployed',
  BlockTarget = 'block_target_height',
  BlockBest = 'block_best_height',
  BlockProcessing = 'block_processing_height',
  BlockLastProcessed = 'block_processed_height',
  BlockQueueSize = 'block_queue_size',
  BlocknumberQueueSize = 'blocknumber_queue_size',
}

export interface ProcessBlockPayload {
  height: number;
  timestamp: number;
}

export interface TargetBlockPayload {
  height: number;
}
