import {Datasource} from '@massbit/types';

export interface IManifest {
  specVersion: string;
  description: string;
  repository: string;
  dataSources: Datasource[];

  validate(): void;
}

export interface INetworkConfig {
  endpoint: string;
  networkIndexer?: string;
  genesisHash?: string;
}
