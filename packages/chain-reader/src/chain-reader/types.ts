import {SubstrateBlock, SubstrateEvent, SubstrateExtrinsic} from '@massbit/types';

export interface BlockContent {
  block: SubstrateBlock;
  extrinsics: SubstrateExtrinsic[];
  events: SubstrateEvent[];
}
