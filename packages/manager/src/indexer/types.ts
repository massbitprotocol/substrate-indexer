import {SubstrateBlock, SubstrateEvent, SubstrateExtrinsic} from '@massbit/types';
import {ApiPromise} from '@polkadot/api';
import {ApiDecoration} from '@polkadot/api/types';

export interface BlockContent {
  block: SubstrateBlock;
  extrinsics: SubstrateExtrinsic[];
  events: SubstrateEvent[];
}

export type ApiAt = ApiDecoration<'promise'> & {rpc: ApiPromise['rpc']};
