import {SecondLayerHandlerProcessor, SubstrateHandlerKind, SubstrateNetworkFilter} from '@massbit/types';

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
