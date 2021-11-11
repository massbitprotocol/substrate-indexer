import {
  SecondLayerHandlerProcessor,
  SubstrateCustomDatasource,
  Datasource,
  DatasourceKind,
  SubstrateHandlerKind,
  SubstrateNetworkFilter,
  ISubstrateRuntimeDatasource,
} from '@massbit/types';

export function isBlockHandlerProcessor<T extends SubstrateNetworkFilter, E>(
  hp: SecondLayerHandlerProcessor<SubstrateHandlerKind, T, unknown>
): hp is SecondLayerHandlerProcessor<SubstrateHandlerKind.Block, T, E> {
  return hp.baseHandlerKind === SubstrateHandlerKind.Block;
}

export function isEventHandlerProcessor<T extends SubstrateNetworkFilter, E>(
  hp: SecondLayerHandlerProcessor<SubstrateHandlerKind, T, unknown>
): hp is SecondLayerHandlerProcessor<SubstrateHandlerKind.Event, T, E> {
  return hp.baseHandlerKind === SubstrateHandlerKind.Event;
}

export function isCallHandlerProcessor<T extends SubstrateNetworkFilter, E>(
  hp: SecondLayerHandlerProcessor<SubstrateHandlerKind, T, unknown>
): hp is SecondLayerHandlerProcessor<SubstrateHandlerKind.Call, T, E> {
  return hp.baseHandlerKind === SubstrateHandlerKind.Call;
}

export function isCustomDatasource<F extends SubstrateNetworkFilter>(
  ds: Datasource
): ds is SubstrateCustomDatasource<string, F> {
  return ds.kind !== DatasourceKind.Runtime && !!(ds as SubstrateCustomDatasource<string, F>).processor;
}

export function isRuntimeDatasource(ds: Datasource): ds is ISubstrateRuntimeDatasource {
  return ds.kind === DatasourceKind.Runtime;
}
