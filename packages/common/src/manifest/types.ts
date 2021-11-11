import {Datasource} from '@massbit/types';

export interface IManifest {
  specVersion: string;
  description: string;
  repository: string;
  dataSources: Datasource[];
}

export interface INetworkConfig {
  endpoint: string;
  networkIndexer?: string;
  genesisHash?: string;
}
