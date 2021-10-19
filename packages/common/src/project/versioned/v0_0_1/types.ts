import {RegisteredTypes} from '@polkadot/types/types';
import {SubstrateNetworkFilter, SubstrateRuntimeDatasource} from '@massbit/types';
import {IProjectManifest, ProjectNetworkConfig} from '../../types';

export type ProjectNetworkConfigV0_0_1 = ProjectNetworkConfig & RegisteredTypes;

export interface RuntimeDataSourceV0_0_1 extends SubstrateRuntimeDatasource {
  name: string;
  filter?: SubstrateNetworkFilter;
}

export interface ProjectManifestV0_0_1 extends IProjectManifest {
  schema: string;
  network: ProjectNetworkConfigV0_0_1;
  dataSources: RuntimeDataSourceV0_0_1[];
}
