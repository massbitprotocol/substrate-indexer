import {ApiPromise} from '@polkadot/api';
import {RegistryTypes} from '@polkadot/types/types';
import {SubstrateBlock, SubstrateEvent, SubstrateExtrinsic} from './interfaces';

export enum SubstrateDatasourceKind {
  Runtime = 'substrate/Runtime',
}

export enum SubstrateHandlerKind {
  Block = 'substrate/BlockHandler',
  Call = 'substrate/CallHandler',
  Event = 'substrate/EventHandler',
}

type RuntimeHandlerInputMap = {
  [SubstrateHandlerKind.Block]: SubstrateBlock;
  [SubstrateHandlerKind.Event]: SubstrateEvent;
  [SubstrateHandlerKind.Call]: SubstrateExtrinsic;
};

type RuntimeFilterMap = {
  [SubstrateHandlerKind.Block]: SubstrateNetworkFilter;
  [SubstrateHandlerKind.Event]: SubstrateEventFilter;
  [SubstrateHandlerKind.Call]: SubstrateCallFilter;
};

export interface ProjectManifest {
  specVersion: string;
  description: string;
  repository: string;

  schema: string;

  network: {
    endpoint: string;
    customTypes?: RegistryTypes;
  };

  dataSources: SubstrateDatasource[];
}

// [startSpecVersion?, endSpecVersion?] closed range
export type SpecVersionRange = [number, number];

interface SubstrateBaseHandlerFilter {
  specVersion?: SpecVersionRange;
}

export type SubstrateBlockFilter = SubstrateBaseHandlerFilter;

export interface SubstrateNetworkFilter {
  specName?: string;
}

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

interface ISubstrateDatasource<M extends SubstrateMapping, F extends SubstrateNetworkFilter = SubstrateNetworkFilter> {
  name?: string;
  kind: string;
  filter?: F;
  startBlock?: number;
  mapping: M;
}

export interface SubstrateRuntimeDatasource<
  M extends SubstrateMapping<SubstrateRuntimeHandler> = SubstrateMapping<SubstrateRuntimeHandler>
> extends ISubstrateDatasource<M> {
  kind: SubstrateDatasourceKind.Runtime;
}

export type SubstrateDatasource = SubstrateRuntimeDatasource | SubstrateCustomDatasource;

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
  (original: RuntimeHandlerInputMap[T], ds: SubstrateCustomDatasource): U; //  | SubqlBuiltinDataSource
}

export interface SubstrateDatasourceProcessor<K extends string, F extends SubstrateNetworkFilter> {
  kind: K;
  validate(ds: SubstrateCustomDatasource<K, F>): void;
  dsFilterProcessor(ds: SubstrateCustomDatasource<K, F>, api: ApiPromise): boolean;
  handlerProcessors: {[kind: string]: SecondLayerHandlerProcessor<SubstrateHandlerKind, unknown, unknown>};
}

// only allow one custom handler for each baseHandler kind
export interface SecondLayerHandlerProcessor<K extends SubstrateHandlerKind, F, E> {
  // kind: string;
  baseHandlerKind: K;
  baseFilter: RuntimeFilterMap[K] | RuntimeFilterMap[K][];
  transformer: HandlerInputTransformer<K, E>;
  filterProcessor: (filter: F, input: E, ds: SubstrateCustomDatasource<string, SubstrateNetworkFilter>) => boolean;
}
