import {
  Entity,
  SubstrateCallFilter,
  SubstrateEventFilter,
  SubstrateBlock,
  SubstrateEvent,
  SubstrateExtrinsic,
} from '@massbit/types';

export interface BlockContent {
  block: SubstrateBlock;
  extrinsics: SubstrateExtrinsic[];
  events: SubstrateEvent[];
}

export interface IndexerFilters {
  eventFilters: SubstrateEventFilter[];
  extrinsicFilters: SubstrateCallFilter[];
}

export enum OperationType {
  Set = 'Set',
  Remove = 'Remove',
}

export type OperationEntity = {
  operation: OperationType;
  entityType: string;
  data: Entity | string;
};
