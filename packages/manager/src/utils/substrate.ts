import {
  SpecVersionRange,
  SubstrateBlockFilter,
  SubstrateCallFilter,
  SubstrateEventFilter,
  SubstrateBlock,
  SubstrateEvent,
  SubstrateExtrinsic,
} from '@massbit/types';
import {ApiPromise} from '@polkadot/api';
import {Vec} from '@polkadot/types';
import {BlockHash, EventRecord, RuntimeVersion, SignedBlock} from '@polkadot/types/interfaces';
import {merge} from 'lodash';
import {BlockContent} from '../indexer/types';

export function wrapBlock(signedBlock: SignedBlock, events: EventRecord[], specVersion?: number): SubstrateBlock {
  return merge(signedBlock, {
    timestamp: getTimestamp(signedBlock),
    specVersion: specVersion,
    events,
  });
}

function getTimestamp({block: {extrinsics}}: SignedBlock): Date {
  for (const e of extrinsics) {
    const {
      method: {method, section},
    } = e;
    if (section === 'timestamp' && method === 'set') {
      const date = new Date(e.args[0].toJSON() as number);
      if (isNaN(date.getTime())) {
        throw new Error('timestamp args type wrong');
      }
      return date;
    }
  }
}

export function wrapExtrinsics(wrappedBlock: SubstrateBlock, allEvents: EventRecord[]): SubstrateExtrinsic[] {
  return wrappedBlock.block.extrinsics.map((extrinsic, idx) => {
    const events = filterExtrinsicEvents(idx, allEvents);
    return {
      idx,
      extrinsic,
      block: wrappedBlock,
      events,
      success: getExtrinsicSuccess(events),
    };
  });
}

function getExtrinsicSuccess(events: EventRecord[]): boolean {
  return events.findIndex((evt) => evt.event.method === 'ExtrinsicSuccess') > -1;
}

function filterExtrinsicEvents(extrinsicIdx: number, events: EventRecord[]): EventRecord[] {
  return events.filter(({phase}) => phase.isApplyExtrinsic && phase.asApplyExtrinsic.eqn(extrinsicIdx));
}

export function wrapEvents(
  extrinsics: SubstrateExtrinsic[],
  events: EventRecord[],
  block: SubstrateBlock
): SubstrateEvent[] {
  return events.reduce((acc, event, idx) => {
    const {phase} = event;
    const wrappedEvent: SubstrateEvent = merge(event, {idx, block});
    if (phase.isApplyExtrinsic) {
      wrappedEvent.extrinsic = extrinsics[phase.asApplyExtrinsic.toNumber()];
    }
    acc.push(wrappedEvent);
    return acc;
  }, [] as SubstrateEvent[]);
}

function checkSpecRange(specVersionRange: SpecVersionRange, specVersion: number) {
  const [lowerBond, upperBond] = specVersionRange;
  return (
    (lowerBond === undefined || lowerBond === null || specVersion >= lowerBond) &&
    (upperBond === undefined || upperBond === null || specVersion <= upperBond)
  );
}

export function filterBlock(block: SubstrateBlock, filter?: SubstrateBlockFilter): SubstrateBlock | undefined {
  if (!filter) return block;
  return filter.specVersion === undefined ||
    block.specVersion === undefined ||
    checkSpecRange(filter.specVersion, block.specVersion)
    ? block
    : undefined;
}

export function filterExtrinsics(
  extrinsics: SubstrateExtrinsic[],
  filterOrFilters: SubstrateCallFilter | SubstrateCallFilter[] | undefined
): SubstrateExtrinsic[] {
  if (!filterOrFilters || (filterOrFilters instanceof Array && filterOrFilters.length === 0)) {
    return extrinsics;
  }
  const filters = filterOrFilters instanceof Array ? filterOrFilters : [filterOrFilters];
  return extrinsics.filter(({block, extrinsic, success}) =>
    filters.find(
      (filter) =>
        (filter.specVersion === undefined ||
          block.specVersion === undefined ||
          checkSpecRange(filter.specVersion, block.specVersion)) &&
        (filter.module === undefined || extrinsic.method.section === filter.module) &&
        (filter.method === undefined || extrinsic.method.method === filter.method) &&
        (filter.success === undefined || success === filter.success)
    )
  );
}

export function filterEvents(
  events: SubstrateEvent[],
  filterOrFilters?: SubstrateEventFilter | SubstrateEventFilter[] | undefined
): SubstrateEvent[] {
  if (!filterOrFilters || (filterOrFilters instanceof Array && filterOrFilters.length === 0)) {
    return events;
  }
  const filters = filterOrFilters instanceof Array ? filterOrFilters : [filterOrFilters];
  return events.filter(({block, event}) =>
    filters.find(
      (filter) =>
        (filter.specVersion === undefined ||
          block.specVersion === undefined ||
          checkSpecRange(filter.specVersion, block.specVersion)) &&
        (filter.module ? event.section === filter.module : true) &&
        (filter.method ? event.method === filter.method : true)
    )
  );
}

export async function prefetchMetadata(api: ApiPromise, hash: BlockHash): Promise<void> {
  await api.getBlockRegistry(hash);
}

export async function fetchBlocksArray(api: ApiPromise, blockArray: number[]): Promise<SignedBlock[]> {
  return Promise.all(
    blockArray.map(async (height) => {
      const blockHash = await api.rpc.chain.getBlockHash(height);
      return api.rpc.chain.getBlock(blockHash);
    })
  );
}

export async function fetchEventsRange(api: ApiPromise, hashes: BlockHash[]): Promise<Vec<EventRecord>[]> {
  return Promise.all(hashes.map((hash) => api.query.system.events.at(hash)));
}

export async function fetchRuntimeVersionRange(api: ApiPromise, hashes: BlockHash[]): Promise<RuntimeVersion[]> {
  return Promise.all(hashes.map((hash) => api.rpc.state.getRuntimeVersion(hash)));
}

export async function fetchBlocksBatches(
  api: ApiPromise,
  blockArray: number[],
  overallSpecVer?: number
): Promise<BlockContent[]> {
  const blocks = await fetchBlocksArray(api, blockArray);
  const blockHashes = blocks.map((b) => b.block.header.hash);
  const parentBlockHashes = blocks.map((b) => b.block.header.parentHash);
  const [blockEvents, runtimeVersions] = await Promise.all([
    fetchEventsRange(api, blockHashes),
    overallSpecVer ? undefined : fetchRuntimeVersionRange(api, parentBlockHashes),
  ]);
  return blocks.map((block, idx) => {
    const events = blockEvents[idx];
    const parentSpecVersion = overallSpecVer ? overallSpecVer : runtimeVersions[idx].specVersion.toNumber();
    const wrappedBlock = wrapBlock(block, events.toArray(), parentSpecVersion);
    const wrappedExtrinsics = wrapExtrinsics(wrappedBlock, events);
    const wrappedEvents = wrapEvents(wrappedExtrinsics, events, wrappedBlock);
    return {
      block: wrappedBlock,
      extrinsics: wrappedExtrinsics,
      events: wrappedEvents,
    };
  });
}
