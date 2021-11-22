import path from 'path';
import {
  buildSchema,
  getAllEntitiesRelations,
  isRuntimeDatasource,
  Project,
} from '@massbit/common';
import {
  Datasource,
  SubstrateHandlerKind,
  SubstrateRuntimeHandler,
} from '@massbit/types';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiPromise } from '@polkadot/api';
import { QueryTypes, Sequelize } from 'sequelize';
import { Config } from '../configure/config';
import { IndexerModel, IndexerRepo, MetadataFactory } from '../entities';
import { getLogger } from '../utils/logger';
import * as SubstrateUtil from '../utils/substrate';
import { ApiService } from './api.service';
import { IndexerEvent } from './events';
import { FetchService } from './fetch.service';
import { IndexerSandbox, SandboxService } from './sandbox.service';
import { StoreService } from './store.service';
import { BlockContent } from './types';

const logger = getLogger('indexer');

@Injectable()
export class IndexerManager {
  private api: ApiPromise;
  private indexerState: IndexerModel;
  private prevSpecVersion?: number;
  private filteredDataSources: Datasource[];

  constructor(
    private apiService: ApiService,
    private storeService: StoreService,
    private fetchService: FetchService,
    private sequelize: Sequelize,
    private project: Project,
    private config: Config,
    private sandboxService: SandboxService,
    @Inject('Indexer') protected indexerRepo: IndexerRepo,
    private eventEmitter: EventEmitter2,
  ) {}

  async indexBlock(blockContent: BlockContent): Promise<void> {
    const { block } = blockContent;
    const blockHeight = block.block.header.number.toNumber();
    this.eventEmitter.emit(IndexerEvent.BlockProcessing, {
      height: blockHeight,
      timestamp: Date.now(),
    });
    const tx = await this.sequelize.transaction();
    this.storeService.setTransaction(tx);

    try {
      const isUpgraded = block.specVersion !== this.prevSpecVersion;
      // if parentBlockHash injected, which means we need to check runtime upgrade
      const apiAt = await this.apiService.getPatchedApi(
        block.block.hash,
        isUpgraded ? block.block.header.parentHash : undefined,
      );
      for (const ds of this.filteredDataSources) {
        const vm = this.sandboxService.getDatasourceProcessor(ds, apiAt);
        if (isRuntimeDatasource(ds)) {
          await IndexerManager.indexBlockForRuntimeDatasource(
            vm,
            ds.mapping.handlers,
            blockContent,
          );
        }
      }
      this.indexerState.nextBlockHeight =
        block.block.header.number.toNumber() + 1;
      await this.indexerState.save({ transaction: tx });
    } catch (e) {
      await tx.rollback();
      throw e;
    }
    await tx.commit();
    this.fetchService.latestProcessed(block.block.header.number.toNumber());
    this.prevSpecVersion = block.specVersion;
    this.eventEmitter.emit(IndexerEvent.BlockLastProcessed, {
      height: blockHeight,
      timestamp: Date.now(),
    });
  }

  async start(): Promise<void> {
    await this.fetchService.init();
    this.api = this.apiService.getApi();
    this.indexerState = await this.createIndexer(this.config.indexerName);
    await this.initDbSchema();
    await this.ensureMetadata(this.indexerState.dbSchema);
    void this.fetchService
      .startLoop(this.indexerState.nextBlockHeight)
      .catch((err) => {
        logger.error(err, 'failed to fetch block');
        process.exit(1);
      });
    this.filteredDataSources = this.filterDataSources();
    this.fetchService.register((block) => this.indexBlock(block));
  }

  private getStartBlockFromDataSources() {
    const startBlocksList = this.getDataSourcesForSpecName().map(
      (item) => item.startBlock ?? 1,
    );
    if (startBlocksList.length === 0) {
      logger.error(
        `Failed to find a valid datasource, Please check your endpoint if specName filter is used.`,
      );
      process.exit(1);
    } else {
      return Math.min(...startBlocksList);
    }
  }

  private async ensureMetadata(schema: string) {
    const metadataRepo = MetadataFactory(this.sequelize, schema);
    const { chain, genesisHash, specName } = this.apiService.networkMeta;

    this.eventEmitter.emit(
      IndexerEvent.NetworkMetadata,
      this.apiService.networkMeta,
    );

    const keys = ['blockOffset', 'chain', 'specName', 'genesisHash'] as const;
    const entries = await metadataRepo.findAll({
      where: {
        key: keys,
      },
    });

    const keyValue = entries.reduce((arr, curr) => {
      arr[curr.key] = curr.value;
      return arr;
    }, {} as { [key in typeof keys[number]]: string | boolean | number });

    // blockOffset and genesisHash should only been create once, never update
    // if blockOffset is changed, will require re-index.
    if (!keyValue.blockOffset) {
      const offsetValue = (this.getStartBlockFromDataSources() - 1).toString();
      await this.storeService.setMetadata('blockOffset', offsetValue);
    }

    if (!keyValue.genesisHash) {
      await this.storeService.setMetadata('genesisHash', genesisHash);
    }

    if (keyValue.chain !== chain) {
      await this.storeService.setMetadata('chain', chain);
    }

    if (keyValue.specName !== specName) {
      await this.storeService.setMetadata('specName', specName);
    }
  }

  private async createIndexer(name: string): Promise<IndexerModel> {
    let indexer = await this.indexerRepo.findOne({
      where: { name: this.config.indexerName },
    });
    const { chain, genesisHash } = this.apiService.networkMeta;
    if (!indexer) {
      const suffix = await this.nextIndexerSchemaSuffix();
      const projectSchema = `indexer_${suffix}`;
      const schemas = await this.sequelize.showAllSchemas(undefined);
      if (!(schemas as unknown as string[]).includes(projectSchema)) {
        await this.sequelize.createSchema(projectSchema, undefined);
      }

      indexer = await this.indexerRepo.create({
        name,
        dbSchema: projectSchema,
        hash: '0x',
        nextBlockHeight: this.getStartBlockFromDataSources(),
        network: chain,
        networkGenesis: genesisHash,
      });
    } else {
      if (!indexer.networkGenesis || !indexer.network) {
        indexer.network = chain;
        indexer.networkGenesis = genesisHash;
        await indexer.save();
      } else if (indexer.networkGenesis !== genesisHash) {
        logger.error(
          `Not same network: genesisHash different. expected="${indexer.networkGenesis}"" actual="${genesisHash}"`,
        );
        process.exit(1);
      }
    }
    return indexer;
  }

  private async initDbSchema(): Promise<void> {
    const schema = this.indexerState.dbSchema;
    const graphqlSchema = buildSchema(
      path.join(this.project.path, this.project.schema),
    );
    const modelsRelations = getAllEntitiesRelations(graphqlSchema);
    await this.storeService.init(modelsRelations, schema);
  }

  private async nextIndexerSchemaSuffix(): Promise<number> {
    const seqExists = await this.sequelize.query(
      `SELECT 1
       FROM information_schema.sequences
       where sequence_schema = 'public'
         and sequence_name = 'indexer_schema_seq'`,
      {
        type: QueryTypes.SELECT,
      },
    );
    if (!seqExists.length) {
      await this.sequelize.query(
        `CREATE SEQUENCE indexer_schema_seq as integer START 1;`,
        { type: QueryTypes.RAW },
      );
    }
    const [{ nextval }] = await this.sequelize.query(
      `SELECT nextval('indexer_schema_seq')`,
      {
        type: QueryTypes.SELECT,
      },
    );
    return Number(nextval);
  }

  private filterDataSources(): Datasource[] {
    let filteredDs = this.getDataSourcesForSpecName();
    if (filteredDs.length === 0) {
      logger.error(
        `Did not find any dataSource match with network specName ${this.api.runtimeVersion.specName}`,
      );
      process.exit(1);
    }

    filteredDs = filteredDs.filter(
      (ds) => ds.startBlock <= this.indexerState.nextBlockHeight,
    );
    if (filteredDs.length === 0) {
      logger.error(
        `Your start block is greater than the current indexed block height in your database. Either change your startBlock (project.yaml) to <= ${this.indexerState.nextBlockHeight} or delete your database and start again from the currently specified startBlock`,
      );
      process.exit(1);
    }

    if (!filteredDs.length) {
      logger.error(`Did not find any datasources with associated processor`);
      process.exit(1);
    }
    return filteredDs;
  }

  private getDataSourcesForSpecName(): Datasource[] {
    return this.project.dataSources.filter(
      (ds) =>
        !ds.filter?.specName ||
        ds.filter.specName === this.api.runtimeVersion.specName.toString(),
    );
  }

  private static async indexBlockForRuntimeDatasource(
    vm: IndexerSandbox,
    handlers: SubstrateRuntimeHandler[],
    { block, events, extrinsics }: BlockContent,
  ): Promise<void> {
    for (const handler of handlers) {
      switch (handler.kind) {
        case SubstrateHandlerKind.Block:
          if (SubstrateUtil.filterBlock(block, handler.filter)) {
            await vm.securedExec(handler.handler, [block]);
          }
          break;
        case SubstrateHandlerKind.Call: {
          const filteredExtrinsics = SubstrateUtil.filterExtrinsics(
            extrinsics,
            handler.filter,
          );
          for (const e of filteredExtrinsics) {
            await vm.securedExec(handler.handler, [e]);
          }
          break;
        }
        case SubstrateHandlerKind.Event: {
          const filteredEvents = SubstrateUtil.filterEvents(
            events,
            handler.filter,
          );
          for (const e of filteredEvents) {
            await vm.securedExec(handler.handler, [e]);
          }
          break;
        }
        default:
      }
    }
  }
}
