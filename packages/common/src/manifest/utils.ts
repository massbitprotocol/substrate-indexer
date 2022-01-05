import {Datasource, DatasourceKind, SubstrateRuntimeDatasource} from '@massbit/types';

export function isRuntimeDatasource(ds: Datasource): ds is SubstrateRuntimeDatasource {
  return ds.kind === DatasourceKind.Runtime;
}
