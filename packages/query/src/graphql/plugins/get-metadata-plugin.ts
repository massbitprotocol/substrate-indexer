import {makeExtendSchemaPlugin, gql} from 'graphile-utils';
import fetch from 'node-fetch';
import {setAsyncInterval} from '../../utils/async-interval';
import {argv} from '../../yargs';

const indexerUrl = argv('indexer') as string | undefined;

type Metadata = {
  lastProcessedHeight: number;
  lastProcessedTimestamp: number;
  targetHeight: number;
  chain: string;
  specName: string;
  genesisHash: string;
  indexerHealthy: boolean;
};

const metaCache = {} as Metadata;

export const GetMetadataPlugin = makeExtendSchemaPlugin((build) => {
  setAsyncInterval(async () => {
    let health;
    let meta;
    try {
      meta = await fetch(new URL(`meta`, indexerUrl));
      const result = await meta.json();
      Object.assign(metaCache, result);
    } catch (e) {
      metaCache.indexerHealthy = false;
    }

    try {
      health = await fetch(new URL(`health`, indexerUrl));
      metaCache.indexerHealthy = !!health.ok;
    } catch (e) {
      metaCache.indexerHealthy = false;
    }
  }, 10000);

  return {
    typeDefs: gql`
      type _Metadata {
        lastProcessedHeight: Int
        lastProcessedTimestamp: Date
        targetHeight: Int
        chain: String
        specName: String
        genesisHash: String
        indexerHealthy: Boolean
      }
      extend type Query {
        _metadata: _Metadata
      }
    `,
    resolvers: {
      Query: {
        _metadata: () => metaCache,
      },
    },
  };
});
