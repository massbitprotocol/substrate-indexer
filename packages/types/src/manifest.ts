import {ApiPromise} from '@polkadot/api';
import {RegistryTypes} from '@polkadot/types/types';
import {SubstrateBlock, SubstrateEvent, SubstrateExtrinsic} from './interfaces';

export enum DatasourceKind {
  Runtime = 'substrate/Runtime',
}

export enum SubstrateHandlerKind {
  Block = 'substrate/BlockHandler',
  Call = 'substrate/CallHandler',
  Event = 'substrate/EventHandler',
}

export type RuntimeHandlerInputMap = {
  [SubstrateHandlerKind.Block]: SubstrateBlock;
  [SubstrateHandlerKind.Call]: SubstrateExtrinsic;
  [SubstrateHandlerKind.Event]: SubstrateEvent;
};

type RuntimeFilterMap = {
  [SubstrateHandlerKind.Block]: SubstrateNetworkFilter;
  [SubstrateHandlerKind.Call]: SubstrateCallFilter;
  [SubstrateHandlerKind.Event]: SubstrateEventFilter;
};

export interface Manifest {
  specVersion: string;
  description: string;
  repository: string;
  schema: string;
  network: {
    endpoint: string;
    customTypes?: RegistryTypes;
  };
  dataSources: Datasource[];
}

export type SpecVersionRange = [number, number];

interface SubstrateBaseHandlerFilter {
  specVersion?: SpecVersionRange;
}

export type SubstrateBlockFilter = SubstrateBaseHandlerFilter;

export interface SubstrateEventFilter extends SubstrateBaseHandlerFilter {
  module?: string;
  method?: string;
}

export interface SubstrateCallFilter extends SubstrateEventFilter {
  success?: boolean;
}

export interface SubstrateBlockHandler {
  handler: string;
  kind: SubstrateHandlerKind.Block;
  filter?: SubstrateBlockFilter;
}

export interface SubstrateCallHandler {
  handler: string;
  kind: SubstrateHandlerKind.Call;
  filter?: SubstrateCallFilter;
}

export interface SubstrateEventHandler {
  handler: string;
  kind: SubstrateHandlerKind.Event;
  filter?: SubstrateEventFilter;
}

export interface SubstrateCustomHandler<K extends string = string, F = Record<string, unknown>> {
  handler: string;
  kind: K;
  filter?: F;
}

export type SubstrateRuntimeHandler = SubstrateBlockHandler | SubstrateCallHandler | SubstrateEventHandler;

export type SubstrateHandler = SubstrateRuntimeHandler | SubstrateCustomHandler<string, unknown>;

export type SubstrateHandlerFilter = SubstrateBlockFilter | SubstrateCallFilter | SubstrateEventFilter;

export interface SubstrateMapping<T extends SubstrateHandler = SubstrateHandler> {
  handlers: T[];
}

export interface SubstrateNetworkFilter {
  specName?: string;
}

interface ISubstrateDatasource<M extends SubstrateMapping, F extends SubstrateNetworkFilter = SubstrateNetworkFilter> {
  name?: string;
  kind: string;
  filter?: F;
  startBlock?: number;
  mapping: M;
}

export interface ISubstrateRuntimeDatasource<
  M extends SubstrateMapping<SubstrateRuntimeHandler> = SubstrateMapping<SubstrateRuntimeHandler>
> extends ISubstrateDatasource<M> {
  kind: DatasourceKind.Runtime;
}

export interface FileReference {
  file: string;
}

export type CustomDataSourceAsset = FileReference;

export interface SubstrateCustomDatasource<
  K extends string = string,
  T extends SubstrateNetworkFilter = SubstrateNetworkFilter,
  M extends SubstrateMapping = SubstrateMapping<SubstrateCustomHandler>
> extends ISubstrateDatasource<M, T> {
  kind: K;
  assets: {[key: string]: CustomDataSourceAsset};
  processor: FileReference;
}

export interface HandlerInputTransformer<T extends SubstrateHandlerKind, U> {
  (original: RuntimeHandlerInputMap[T], ds: SubstrateCustomDatasource): U;
}

export interface SubstrateDatasourceProcessor<K extends string, F extends SubstrateNetworkFilter> {
  kind: K;
  validate(ds: SubstrateCustomDatasource<K, F>): void;
  dsFilterProcessor(ds: SubstrateCustomDatasource<K, F>, api: ApiPromise): boolean;
  handlerProcessors: {[kind: string]: SecondLayerHandlerProcessor<SubstrateHandlerKind, unknown, unknown>};
}

// only allow one custom handler for each baseHandler kind
export interface SecondLayerHandlerProcessor<K extends SubstrateHandlerKind, F, E> {
  baseHandlerKind: K;
  baseFilter: RuntimeFilterMap[K] | RuntimeFilterMap[K][];
  transformer: HandlerInputTransformer<K, E>;
  filterProcessor: (filter: F, input: E, ds: SubstrateCustomDatasource<string, SubstrateNetworkFilter>) => boolean;
}

export type Datasource = ISubstrateRuntimeDatasource | SubstrateCustomDatasource;
