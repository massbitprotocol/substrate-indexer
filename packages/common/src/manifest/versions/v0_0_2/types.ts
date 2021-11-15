import {
  SubstrateCustomDatasource,
  Datasource,
  DatasourceKind,
  SubstrateHandler,
  SubstrateMapping,
  SubstrateRuntimeDatasource,
  SubstrateRuntimeHandler,
} from '@massbit/types';
import {IManifest} from '../../types';

export interface SubstrateMappingV0_0_2<T extends SubstrateHandler> extends SubstrateMapping<T> {
  file: string;
}

export type IRuntimeDataSourceV0_0_2 = SubstrateRuntimeDatasource<SubstrateMappingV0_0_2<SubstrateRuntimeHandler>>;

export interface IManifestV0_0_2 extends IManifest {
  name: string;
  version: string;
  schema: {
    file: string;
  };
  network: {
    genesisHash: string;
    endpoint?: string;
    chainType?: {
      file: string;
    };
  };
  dataSources: (IRuntimeDataSourceV0_0_2 | SubstrateCustomDatasource)[];
}

export function isRuntimeDataSourceV0_0_2(dataSource: Datasource): dataSource is IRuntimeDataSourceV0_0_2 {
  return dataSource.kind === DatasourceKind.Runtime && !!(dataSource as IRuntimeDataSourceV0_0_2).mapping.file;
}
