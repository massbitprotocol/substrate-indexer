import {SubstrateNetworkFilter, SubstrateRuntimeDatasource} from '@massbit/types';
import {RegisteredTypes} from '@polkadot/types/types';
import {IManifest, INetworkConfig} from '../../types';

export type NetworkConfigV0_0_1 = INetworkConfig & RegisteredTypes;

export interface IRuntimeDataSourceV0_0_1 extends SubstrateRuntimeDatasource {
  name: string;
  filter?: SubstrateNetworkFilter;
}

export interface IManifestV0_0_1 extends IManifest {
  schema: string;
  network: NetworkConfigV0_0_1;
  dataSources: IRuntimeDataSourceV0_0_1[];
}
