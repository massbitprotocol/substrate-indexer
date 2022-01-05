import path from 'path';
import {buildSchema, getAllEntitiesRelations, isRuntimeDatasource, Project} from '@massbit/common';
import {Datasource, SubstrateHandlerKind, SubstrateRuntimeHandler} from '@massbit/types';
import {EventEmitter2} from '@nestjs/event-emitter';
import {SchedulerRegistry} from '@nestjs/schedule';
import {ApiPromise} from '@polkadot/api';
import Pino from 'pino';
import {QueryTypes, Sequelize} from 'sequelize';
import {Config} from '../configure/config';
import {IndexerRepo, IndexerStatus} from '../entities';
import {getLogger} from '../utils/logger';
import * as SubstrateUtil from '../utils/substrate';
import {ApiService} from './api.service';
import {MetadataFactory, MetadataRepo} from './entities/metadata.entity';
import {FetchService} from './fetch.service';
import {NetworkIndexerService} from './network-indexer.service';
import {IndexerSandbox, SandboxService} from './sandbox.service';
import {StoreService} from './store.service';
import {BlockContent} from './types';

export class IndexerInstance {
  private readonly apiService: ApiService;
  private fetchService: FetchService;
  private sandboxService: SandboxService;
  private readonly storeService: StoreService;
  private readonly sequelize: Sequelize;
  private readonly config: Config;
  private readonly eventEmitter: EventEmitter2;
  private readonly networkIndexerService: NetworkIndexerService;
  protected indexerRepo: IndexerRepo;
  logger: Pino.Logger;

  private api: ApiPromise;
  private readonly indexerId: string;
  private prevSpecVersion?: number;
  private filteredDataSources: Datasource[];
  private readonly project: Project;
  protected metadataRepo: MetadataRepo;

  constructor(
    indexerId: string,
    project: Project,
    sequelize: Sequelize,
    config: Config,
    indexerRepo: IndexerRepo,
    eventEmitter: EventEmitter2,
    schedulerRegistry: SchedulerRegistry
  ) {
    this.project = project;
    this.indexerId = indexerId;
    this.sequelize = sequelize;
    this.config = config;
    this.indexerRepo = indexerRepo;
    this.eventEmitter = eventEmitter;

    this.networkIndexerService = new NetworkIndexerService(this.project);
    this.apiService = new ApiService(this.project);
    this.fetchService = new FetchService(
      indexerId,
      this.project,
      this.config,
      this.apiService,
      this.networkIndexerService,
      this.eventEmitter,
      schedulerRegistry
    );
    this.storeService = new StoreService(this.sequelize, this.config);
    this.sandboxService = new SandboxService(this.project, this.config, this.apiService, this.storeService);
    this.logger = getLogger(this.project.name);
  }

  async start(): Promise<void> {
    await this.apiService.init();
    this.api = this.apiService.getApi();

    await this.fetchService.init();

    const dbSchema = await this.ensureIndexer();
    await this.initDbSchema(dbSchema);
    this.metadataRepo = await this.ensureMetadata(dbSchema);

    await this.indexerRepo.update({status: IndexerStatus.RUNNING}, {where: {id: this.indexerId}});

    let startHeight;
    const lastProcessedHeight = await this.metadataRepo.findOne({
      where: {key: 'lastProcessedHeight'},
    });
    if (lastProcessedHeight !== null && lastProcessedHeight.value !== null) {
      startHeight = Number(lastProcessedHeight.value) + 1;
    } else {
      const indexer = await this.indexerRepo.findOne({where: {id: this.indexerId}});
      if (indexer !== null) {
        startHeight = indexer.nextBlockHeight;
      } else {
        startHeight = this.getStartBlockFromDataSources();
      }
    }

    void this.fetchService.startLoop(startHeight).catch((err) => {
      this.logger.error(err, 'fetch block');
    });
    this.filteredDataSources = this.filterDataSources(startHeight);
    this.fetchService.register((block) => this.indexBlock(block));
  }

  async indexBlock(blockContent: BlockContent): Promise<void> {
    const {block} = blockContent;
    const tx = await this.sequelize.transaction();
    this.storeService.setTransaction(tx);
    try {
      const isUpgraded = block.specVersion !== this.prevSpecVersion;
      // if parentBlockHash injected, which means we need to check runtime upgrade
      const apiAt = await this.apiService.getPatchedApi(
        block.block.hash,
        isUpgraded ? block.block.header.parentHash : undefined
      );

      for (const ds of this.filteredDataSources) {
        const vm = this.sandboxService.getDatasourceProcessor(ds, apiAt);
        if (isRuntimeDatasource(ds)) {
          await IndexerInstance.indexBlockForRuntimeDataSource(vm, ds.mapping.handlers, blockContent);
        }
      }

      await Promise.all([
        await this.metadataRepo.upsert(
          {
            key: 'lastProcessedHeight',
            value: block.block.header.number.toNumber(),
          },
          {transaction: tx}
        ),
        await this.metadataRepo.upsert(
          {
            key: 'lastProcessedTimestamp',
            value: Date.now(),
          },
          {transaction: tx}
        ),
      ]);
    } catch (e) {
      await tx.rollback();
      throw e;
    }
    await tx.commit();
    this.fetchService.latestProcessed(block.block.header.number.toNumber());
    this.prevSpecVersion = block.specVersion;
  }

  private getStartBlockFromDataSources() {
    const startBlocksList = this.getDataSourcesForSpecName().map((item) => item.startBlock ?? 1);
    if (startBlocksList.length === 0) {
      throw new Error('Failed to find a valid datasource');
    } else {
      return Math.min(...startBlocksList);
    }
  }

  private async ensureMetadata(dbSchema: string): Promise<MetadataRepo> {
    const metadataRepo = MetadataFactory(this.sequelize, dbSchema);
    const indexer = await this.indexerRepo.findOne({where: {id: this.indexerId}});
    const keys = ['lastProcessedHeight', 'blockOffset', 'chain', 'specName', 'genesisHash'] as const;
    const entries = await metadataRepo.findAll({
      where: {
        key: keys,
      },
    });
    const {chain, specName} = this.apiService.networkMeta;
    const metadata = entries.reduce((arr, curr) => {
      arr[curr.key] = curr.value;
      return arr;
    }, {} as {[key in typeof keys[number]]: string | boolean | number});

    // blockOffset and genesisHash should only been created once, never update
    // if blockOffset is changed, will require re-index.
    if (!metadata.blockOffset) {
      const offsetValue = (this.getStartBlockFromDataSources() - 1).toString();
      await metadataRepo.upsert({key: 'blockOffset', value: offsetValue});
    }

    if (!metadata.genesisHash) {
      await metadataRepo.upsert({
        key: 'genesisHash',
        value: indexer.networkGenesis,
      });
    }

    if (metadata.chain !== chain) {
      await metadataRepo.upsert({key: 'chain', value: chain});
    }

    if (metadata.specName !== specName) {
      await metadataRepo.upsert({key: 'specName', value: specName});
    }

    return metadataRepo;
  }

  private async ensureIndexer(): Promise<string> {
    const {chain, genesisHash} = this.apiService.networkMeta;
    const suffix = await this.nextIndexerSchemaSuffix();
    const dbSchema = `indexer_${suffix}`;
    const schemas = await this.sequelize.showAllSchemas(undefined);
    if (!(schemas as unknown as string[]).includes(dbSchema)) {
      await this.sequelize.createSchema(dbSchema, undefined);
    }
    await this.indexerRepo.update(
      {
        dbSchema,
        hash: '0x',
        nextBlockHeight: this.getStartBlockFromDataSources(),
        network: chain,
        networkGenesis: genesisHash,
      },
      {where: {id: this.indexerId}}
    );

    return dbSchema;
  }

  private async initDbSchema(dbSchema: string): Promise<void> {
    const graphqlSchema = buildSchema(path.join(this.project.path, this.project.schema));
    const modelsRelations = getAllEntitiesRelations(graphqlSchema);
    await this.storeService.init(modelsRelations, dbSchema);
  }

  private async nextIndexerSchemaSuffix(): Promise<number> {
    const seqExists = await this.sequelize.query(
      `SELECT 1
       FROM information_schema.sequences
       where sequence_schema = 'public'
         and sequence_name = 'indexer_schema_seq'`,
      {
        type: QueryTypes.SELECT,
      }
    );
    if (!seqExists.length) {
      await this.sequelize.query(`CREATE SEQUENCE indexer_schema_seq as integer START 1;`, {type: QueryTypes.RAW});
    }
    const [{nextval}] = await this.sequelize.query(`SELECT nextval('indexer_schema_seq')`, {
      type: QueryTypes.SELECT,
    });
    return Number(nextval);
  }

  private filterDataSources(processedHeight: number): Datasource[] {
    let dataSources = this.getDataSourcesForSpecName();
    if (dataSources.length === 0) {
      throw new Error(`Did not find any dataSource match with network specName ${this.api.runtimeVersion.specName}`);
    }
    dataSources = dataSources.filter((ds) => ds.startBlock <= processedHeight);
    if (dataSources.length === 0) {
      throw new Error(`Your start block is greater than the current indexed block height in your database`);
    }
    return dataSources;
  }

  private getDataSourcesForSpecName(): Datasource[] {
    return this.project.dataSources.filter(
      (ds) => !ds.filter?.specName || ds.filter.specName === this.api.runtimeVersion.specName.toString()
    );
  }

  private static async indexBlockForRuntimeDataSource(
    vm: IndexerSandbox,
    handlers: SubstrateRuntimeHandler[],
    {block, events, extrinsics}: BlockContent
  ): Promise<void> {
    for (const handler of handlers) {
      switch (handler.kind) {
        case SubstrateHandlerKind.Block:
          if (SubstrateUtil.filterBlock(block, handler.filter)) {
            await vm.securedExec(handler.handler, [block]);
          }
          break;
        case SubstrateHandlerKind.Call: {
          const filteredExtrinsics = SubstrateUtil.filterExtrinsics(extrinsics, handler.filter);
          for (const e of filteredExtrinsics) {
            await vm.securedExec(handler.handler, [e]);
          }
          break;
        }
        case SubstrateHandlerKind.Event: {
          const filteredEvents = SubstrateUtil.filterEvents(events, handler.filter);
          for (const e of filteredEvents) {
            await vm.securedExec(handler.handler, [e]);
          }
          break;
        }
        default:
      }
    }
  }

  async stop(): Promise<void> {
    this.fetchService.stop();
    await this.indexerRepo.update({status: IndexerStatus.STOPPED}, {where: {id: this.indexerId}});
  }
}
