import {ApolloClient, HttpLink, InMemoryCache, gql} from '@apollo/client/core';
import {MetaData, Project} from '@massbit/common';
import {SubstrateCallFilter, SubstrateEventFilter} from '@massbit/types';
import {OnApplicationShutdown} from '@nestjs/common';
import fetch from 'node-fetch';
import {getLogger} from '../utils/logger';
import {IndexerFilters} from './types';

export type NetworkIndexer = {
  _metadata: MetaData;
  batchBlocks: number[];
};

const logger = getLogger('network-indexer');

export class NetworkIndexerService implements OnApplicationShutdown {
  protected project: Project;
  private isShutdown = false;

  onApplicationShutdown(): void {
    this.isShutdown = true;
  }

  constructor(project: Project) {
    this.project = project;
  }

  /**
   *
   * @param startBlock
   * @param queryEndBlock this block number will limit the max query range, increase query speed
   * @param batchSize
   * @param filters
   */
  async getNetworkIndexer(
    startBlock: number,
    queryEndBlock: number,
    batchSize: number,
    filters: IndexerFilters
  ): Promise<NetworkIndexer> {
    const query = this.generateQuery(
      startBlock,
      queryEndBlock,
      batchSize,
      filters.eventFilters,
      filters.extrinsicFilters
    );

    const client = new ApolloClient({
      cache: new InMemoryCache({resultCaching: true}),
      link: new HttpLink({uri: this.project.network.networkIndexer, fetch}),
      defaultOptions: {
        watchQuery: {
          fetchPolicy: 'no-cache',
        },
        query: {
          fetchPolicy: 'no-cache',
        },
      },
    });

    try {
      const resp = await client.query({
        query: gql(query),
      });
      const blockHeightSet = new Set<number>();
      const specVersionBlockHeightSet = new Set<number>();
      let eventEndBlock: number;
      let extrinsicEndBlock: number;

      if (resp.data.events && resp.data.events.nodes.length >= 0) {
        for (const node of resp.data.events.nodes) {
          blockHeightSet.add(Number(node.blockHeight));
          eventEndBlock = Number(node.blockHeight); //last added event blockHeight
        }
      }

      if (resp.data.extrinsics && resp.data.extrinsics.nodes.length >= 0) {
        for (const node of resp.data.extrinsics.nodes) {
          blockHeightSet.add(Number(node.blockHeight));
          extrinsicEndBlock = Number(node.blockHeight); //last added extrinsic blockHeight
        }
      }

      if (resp.data.specVersions && resp.data.specVersions.nodes.length >= 0) {
        for (const node of resp.data.specVersions.nodes) {
          specVersionBlockHeightSet.add(Number(node.blockHeight));
        }
      }

      const _metadata = resp.data._metadata;
      const endBlock = Math.min(
        isNaN(eventEndBlock) ? Infinity : eventEndBlock,
        isNaN(extrinsicEndBlock) ? Infinity : extrinsicEndBlock
      );
      const batchBlocks = Array.from(blockHeightSet)
        .filter((block) => block <= endBlock)
        .sort((n1, n2) => n1 - n2);

      return {
        _metadata,
        batchBlocks,
      };
    } catch (err) {
      logger.warn(err, `failed to fetch network indexer result`);
      return undefined;
    }
  }

  private generateQuery(
    startBlock: number,
    queryEndBlock: number,
    batchSize: number,
    indexEvents?: SubstrateEventFilter[],
    indexExtrinsics?: SubstrateCallFilter[]
  ): string {
    let eventFilter = ``;
    let extrinsicFilter = ``;
    let baseQuery = ``;
    const metaQuery = `
    _metadata {
      lastProcessedHeight
      lastProcessedTimestamp
      targetHeight
      chain
      specName
      genesisHash
      indexerHealthy
      indexerNodeVersion
      queryNodeVersion
    }`;
    const specVersionQuery = `
    specVersions {
      nodes {
        id
        blockHeight
      }
    }`;
    baseQuery = baseQuery.concat(metaQuery, specVersionQuery);
    if (indexEvents.length > 0) {
      indexEvents.map((event) => {
        eventFilter = eventFilter.concat(`
        {
          and: [
            {module:{equalTo:"${event.module}"}},
            {event:{equalTo:"${event.method}"}}
          ]
        },`);
      });
      const eventQuery = `
      events(
        filter: {
          blockHeight: {greaterThanOrEqualTo:"${startBlock}", lessThan:"${queryEndBlock}"},
          or: [${eventFilter}]
        },
        orderBy: BLOCK_HEIGHT_ASC,
        first: ${batchSize}
      ) {
        nodes {
          blockHeight
        }
      }`;
      baseQuery = baseQuery.concat(eventQuery);
    }

    if (indexExtrinsics.length > 0) {
      indexExtrinsics.map((extrinsic) => {
        extrinsicFilter = extrinsicFilter.concat(`
        {
          and:[
            {module: {equalTo: "${extrinsic.module}"}},
            {call: {equalTo: "${extrinsic.method}"}}
          ]
        },`);
      });
      const extrinsicQueryQuery = `
      extrinsics(
        filter: {
          blockHeight: {greaterThanOrEqualTo:"${startBlock}", lessThan: "${queryEndBlock}"},
          or: [${extrinsicFilter}]
        },
        orderBy: BLOCK_HEIGHT_ASC,
        first: ${batchSize}
      ) {
        nodes {
          blockHeight
        }
      }`;
      baseQuery = baseQuery.concat(extrinsicQueryQuery);
    }

    return `query{${baseQuery}}`;
  }
}
