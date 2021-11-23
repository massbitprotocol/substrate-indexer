import {
  SubstrateCallFilter,
  SubstrateEventFilter,
  SubstrateBlock,
  SubstrateEvent,
  SubstrateExtrinsic,
} from '@massbit/types';
import {ApiPromise} from '@polkadot/api';
import {ApiDecoration} from '@polkadot/api/types';

export interface BlockContent {
  block: SubstrateBlock;
  extrinsics: SubstrateExtrinsic[];
  events: SubstrateEvent[];
}

export interface IndexerFilters {
  eventFilters: SubstrateEventFilter[];
  extrinsicFilters: SubstrateCallFilter[];
}

export type ApiAt = ApiDecoration<'promise'> & {rpc: ApiPromise['rpc']};
