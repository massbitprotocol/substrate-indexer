import {
  SubstrateCustomDatasource,
  SubstrateDatasource,
  SubstrateDatasourceKind,
  SubstrateHandler,
  SubstrateMapping,
  SubstrateRuntimeDatasource,
  SubstrateRuntimeHandler,
} from '@massbit/types';
import {IProjectManifest} from '../../types';

export interface SubstrateMappingV0_2_0<T extends SubstrateHandler> extends SubstrateMapping<T> {
  file: string;
}

export type RuntimeDataSourceV0_2_0 = SubstrateRuntimeDatasource<SubstrateMappingV0_2_0<SubstrateRuntimeHandler>>;

export interface ProjectManifestV0_2_0 extends IProjectManifest {
  name: string;
  version: string;
  schema: {
    file: string;
  };

  network: {
    genesisHash: string;
    endpoint?: string;
    chaintypes?: {
      file: string;
    };
  };

  dataSources: (RuntimeDataSourceV0_2_0 | SubstrateCustomDatasource)[];
}

export function isRuntimeDataSourceV0_2_0(dataSource: SubstrateDatasource): dataSource is RuntimeDataSourceV0_2_0 {
  return dataSource.kind === SubstrateDatasourceKind.Runtime && !!(dataSource as RuntimeDataSourceV0_2_0).mapping.file;
}
