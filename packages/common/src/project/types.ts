import {SubstrateDatasource} from '@massbit/types';

export interface IProjectManifest {
  specVersion: string;
  description: string;
  repository: string;
  dataSources: SubstrateDatasource[];
}

export interface ProjectNetworkConfig {
  endpoint: string;
  dictionary?: string;
  genesisHash?: string;
}
