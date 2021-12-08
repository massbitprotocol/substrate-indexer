export enum IndexerEvent {
  IndexerDeployed = 'indexer_deployed',
  BlockTarget = 'block_target_height',
  BlockLastProcessed = 'block_processed_height',
}

export interface DeployIndexerPayload {
  id: string;
}

export interface ProcessBlockPayload {
  id: string;
  height: number;
  timestamp: number;
}

export interface TargetBlockPayload {
  id: string;
  height: number;
}
