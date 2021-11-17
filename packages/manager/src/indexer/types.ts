import {
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
