import path from 'path';
import {buildSchema, getAllEntitiesRelations, isRuntimeDatasource, Project} from '@massbit/common';
import {Datasource, SubstrateHandlerKind, SubstrateRuntimeHandler} from '@massbit/types';
import {EventEmitter2} from '@nestjs/event-emitter';
import {ApiPromise} from '@polkadot/api';
import Pino from 'pino';
import {QueryTypes, Sequelize} from 'sequelize';
import {Config} from '../configure/config';
import {IndexerModel, IndexerRepo, IndexerStatus} from '../entities';
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
  private indexer: IndexerModel;
  private prevSpecVersion?: number;
  private filteredDataSources: Datasource[];
  private readonly project: Project;

  constructor(
    project: Project,
    indexer: IndexerModel,
    sequelize: Sequelize,
    config: Config,
    indexerRepo: IndexerRepo,
    eventEmitter: EventEmitter2
  ) {
    this.project = project;
    this.indexer = indexer;
    this.sequelize = sequelize;
    this.config = config;
    this.indexerRepo = indexerRepo;
    this.eventEmitter = eventEmitter;

    this.networkIndexerService = new NetworkIndexerService(this.project);
    this.apiService = new ApiService(this.project);
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

  async start(): Promise<void> {
    await this.apiService.init();
    await this.fetchService.init();
    this.api = this.apiService.getApi();
    await this.ensureIndexer();
    await this.initDbSchema();
    await this.ensureMetadata(this.indexer.dbSchema);

    this.indexer.status = IndexerStatus.DEPLOYED;
    await this.indexer.save();

    void this.fetchService.startLoop(this.indexer.nextBlockHeight).catch((err) => {
      this.logger.error(err, 'fetch block');
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
      this.indexer.nextBlockHeight = block.block.header.number.toNumber() + 1;
      await this.indexer.save({transaction: tx});
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
      throw new Error('Failed to find a valid datasource');
    } else {
      return Math.min(...startBlocksList);
    }
  }

  private async ensureMetadata(schema: string) {
    const metadataRepo = MetadataFactory(this.sequelize, schema);
    const {chain, genesisHash, specName} = this.apiService.networkMeta;
    const keys = ['blockOffset', 'chain', 'specName', 'genesisHash'] as const;
    const entries = await metadataRepo.findAll({
      where: {
        key: keys,
      },
    });

    const keyValue = entries.reduce((arr, curr) => {
      arr[curr.key] = curr.value;
      return arr;
    }, {} as {[key in typeof keys[number]]: string | boolean | number});

    // blockOffset and genesisHash should only been created once, never update
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

  private async ensureIndexer() {
    const {chain, genesisHash} = this.apiService.networkMeta;
    const suffix = await this.nextIndexerSchemaSuffix();
    const indexerSchema = `indexer_${suffix}`;
    const schemas = await this.sequelize.showAllSchemas(undefined);
    if (!(schemas as unknown as string[]).includes(indexerSchema)) {
      await this.sequelize.createSchema(indexerSchema, undefined);
    }
    await this.indexer.update({
      dbSchema: indexerSchema,
      hash: '0x',
      nextBlockHeight: this.getStartBlockFromDataSources(),
      network: chain,
      networkGenesis: genesisHash,
    });

    if (!this.indexer.networkGenesis || !this.indexer.network) {
      this.indexer.network = chain;
      this.indexer.networkGenesis = genesisHash;
      await this.indexer.save();
    } else if (this.indexer.networkGenesis !== genesisHash) {
      throw new Error(
        `Not same network: genesisHash different. expected="${this.indexer.networkGenesis}"" actual="${genesisHash}"`
      );
    }
  }

  private async initDbSchema(): Promise<void> {
    const schema = this.indexer.dbSchema;
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
      throw new Error(`Did not find any dataSource match with network specName ${this.api.runtimeVersion.specName}`);
    }
    filteredDs = filteredDs.filter((ds) => ds.startBlock <= this.indexer.nextBlockHeight);
    if (filteredDs.length === 0) {
      throw new Error(
        `Your start block is greater than the current indexed block height in your database. Either change your startBlock (project.yaml) to <= ${this.indexer.nextBlockHeight} or delete your database and start again from the currently specified startBlock`
      );
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
