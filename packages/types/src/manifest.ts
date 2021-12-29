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

interface SubstrateBaseFilter {
  specVersion?: SpecVersionRange;
}

export type SubstrateBlockFilter = SubstrateBaseFilter;

export interface SubstrateEventFilter extends SubstrateBaseFilter {
  module?: string;
  method?: string;
}

export interface SubstrateCallFilter extends SubstrateEventFilter {
  success?: boolean;
}

export type SubstrateHandlerFilter = SubstrateBlockFilter | SubstrateCallFilter | SubstrateEventFilter;

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

export type SubstrateRuntimeHandler = SubstrateBlockHandler | SubstrateCallHandler | SubstrateEventHandler;

export type SubstrateHandler = SubstrateRuntimeHandler;

export interface SubstrateMapping<T extends SubstrateHandler = SubstrateHandler> {
  handlers: T[];
}

export interface SubstrateNetworkFilter {
  specName?: string;
}

interface SubstrateDatasource<M extends SubstrateMapping, F extends SubstrateNetworkFilter = SubstrateNetworkFilter> {
  name?: string;
  kind: string;
  filter?: F;
  startBlock?: number;
  mapping: M;
}

export interface SubstrateRuntimeDatasource<
  M extends SubstrateMapping<SubstrateRuntimeHandler> = SubstrateMapping<SubstrateRuntimeHandler>
> extends SubstrateDatasource<M> {
  kind: DatasourceKind.Runtime;
}

export type Datasource = SubstrateRuntimeDatasource;
