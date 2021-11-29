import path from 'path';
import {buildSchema, getAllEntitiesRelations, isRuntimeDatasource, Project} from '@massbit/common';
import {Datasource, SubstrateHandlerKind, SubstrateRuntimeHandler} from '@massbit/types';
import {EventEmitter2} from '@nestjs/event-emitter';
import {ApiPromise} from '@polkadot/api';
import Pino from 'pino';
import {QueryTypes, Sequelize} from 'sequelize';
import {Config} from '../configure/config';
import {DeployIndexerDto} from '../dto';
import {IndexerModel, IndexerRepo} from '../entities';
import {getLogger} from '../utils/logger';
import * as SubstrateUtil from '../utils/substrate';
import {ApiService} from './api.service';
import {MetadataFactory} from './entities/metadata.entity';
import {IndexerEvent} from './events';
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
  private indexerState: IndexerModel;
  private prevSpecVersion?: number;
  private filteredDataSources: Datasource[];
  private readonly project: Project;

  constructor(
    project: Project,
    sequelize: Sequelize,
    config: Config,
    indexerRepo: IndexerRepo,
    eventEmitter: EventEmitter2
  ) {
    this.project = project;
    this.sequelize = sequelize;
    this.config = config;
    this.indexerRepo = indexerRepo;
    this.eventEmitter = eventEmitter;

    this.networkIndexerService = new NetworkIndexerService(this.project);
    this.apiService = new ApiService(this.project, this.eventEmitter);
    this.fetchService = new FetchService(
      this.project,
      this.config,
      this.apiService,
      this.networkIndexerService,
      this.eventEmitter
    );
    this.storeService = new StoreService(this.sequelize, this.config);
    this.sandboxService = new SandboxService(this.project, this.config, this.apiService, this.storeService);
    this.logger = getLogger(this.project.name);
  }

  async start(data: DeployIndexerDto): Promise<void> {
    await this.apiService.init();
    await this.fetchService.init();
    this.api = this.apiService.getApi();
    this.indexerState = await this.createIndexer(data);
    await this.initDbSchema();
    await this.ensureMetadata(this.indexerState.dbSchema);

    void this.fetchService.startLoop(this.indexerState.nextBlockHeight).catch((err) => {
      this.logger.error(err, 'failed to fetch block');
      process.exit(1);
    });
    this.filteredDataSources = this.filterDataSources();
    this.fetchService.register((block) => this.indexBlock(block));
  }

  async indexBlock(blockContent: BlockContent): Promise<void> {
    const {block} = blockContent;
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
        isUpgraded ? block.block.header.parentHash : undefined
      );
      for (const ds of this.filteredDataSources) {
        const vm = this.sandboxService.getDatasourceProcessor(ds, apiAt);
        if (isRuntimeDatasource(ds)) {
          await IndexerInstance.indexBlockForRuntimeDs(vm, ds.mapping.handlers, blockContent);
        }
      }
      this.indexerState.nextBlockHeight = block.block.header.number.toNumber() + 1;
      await this.indexerState.save({transaction: tx});
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

  private getStartBlockFromDataSources() {
    const startBlocksList = this.getDataSourcesForSpecName().map((item) => item.startBlock ?? 1);
    if (startBlocksList.length === 0) {
      this.logger.error(`failed to find a valid datasource`);
      process.exit(1);
    } else {
      return Math.min(...startBlocksList);
    }
  }

  private async ensureMetadata(schema: string) {
    const metadataRepo = MetadataFactory(this.sequelize, schema);
    // block offset should only been create once, never update.
    // if change offset will require re-index
    const blockOffset = await metadataRepo.findOne({
      where: {key: 'blockOffset'},
    });
    if (!blockOffset) {
      const offsetValue = (this.getStartBlockFromDataSources() - 1).toString();
      await metadataRepo.create({
        key: 'blockOffset',
        value: offsetValue,
      });
    }
  }

  private async createIndexer(data: DeployIndexerDto): Promise<IndexerModel> {
    const {description, id, imageUrl, name, repository} = data;
    let indexer = await this.indexerRepo.findOne({
      where: {name},
    });
    const {chain, genesisHash} = this.apiService.networkMeta;
    // if (!indexer) {
    const suffix = await this.nextIndexerSchemaSuffix();
    const indexerSchema = `indexer_${suffix}`;
    const schemas = await this.sequelize.showAllSchemas(undefined);
    if (!(schemas as unknown as string[]).includes(indexerSchema)) {
      await this.sequelize.createSchema(indexerSchema, undefined);
    }
    [indexer] = await this.indexerRepo.upsert({
      id,
      name,
      description,
      repository,
      imageUrl,
      dbSchema: indexerSchema,
      hash: '0x',
      nextBlockHeight: this.getStartBlockFromDataSources(),
      network: chain,
      networkGenesis: genesisHash,
    });
    // } else {
    //   if (!indexer.networkGenesis || !indexer.network) {
    //     indexer.network = chain;
    //     indexer.networkGenesis = genesisHash;
    //     await indexer.save();
    //   } else if (indexer.networkGenesis !== genesisHash) {
    //     this.logger.error(
    //       `Not same network: genesisHash different. expected="${indexer.networkGenesis}"" actual="${genesisHash}"`
    //     );
    //     process.exit(1);
    //   }
    // }
    return indexer;
  }

  private async initDbSchema(): Promise<void> {
    const schema = this.indexerState.dbSchema;
    const graphqlSchema = buildSchema(path.join(this.project.path, this.project.schema));
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

  private filterDataSources(): Datasource[] {
    let filteredDs = this.getDataSourcesForSpecName();
    if (filteredDs.length === 0) {
      this.logger.error(`Did not find any dataSource match with network specName ${this.api.runtimeVersion.specName}`);
      process.exit(1);
    }
    filteredDs = filteredDs.filter((ds) => ds.startBlock <= this.indexerState.nextBlockHeight);
    if (filteredDs.length === 0) {
      this.logger.error(
        `Your start block is greater than the current indexed block height in your database. Either change your startBlock (project.yaml) to <= ${this.indexerState.nextBlockHeight} or delete your database and start again from the currently specified startBlock`
      );
      process.exit(1);
    }
    return filteredDs;
  }

  private getDataSourcesForSpecName(): Datasource[] {
    return this.project.dataSources.filter(
      (ds) => !ds.filter?.specName || ds.filter.specName === this.api.runtimeVersion.specName.toString()
    );
  }

  private static async indexBlockForRuntimeDs(
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
}
