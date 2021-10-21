import path from 'path';
import {buildSchema, getAllEntitiesRelations, ProjectNetworkConfig} from '@massbit/common';
import {isBlockHandlerProcessor, isCallHandlerProcessor, isEventHandlerProcessor} from '@massbit/common/project/utils';
import {
  SubstrateCustomDatasource,
  SubstrateDatasource,
  SubstrateHandlerKind,
  SubstrateNetworkFilter,
  SubstrateRuntimeHandler,
} from '@massbit/types';
import {EventEmitter2} from '@nestjs/event-emitter';
import {ApiPromise} from '@polkadot/api';
import {QueryTypes, Sequelize} from 'sequelize';
import {NodeConfig} from '../configure/node-config';
import {SubIndexProject} from '../configure/project.model';
import {IndexerModel, IndexerRepo} from '../entities';
import {getLogger} from '../utils/logger';
import {profiler} from '../utils/profiler';
import {isCustomDs, isRuntimeDs} from '../utils/project';
import * as SubstrateUtil from '../utils/substrate';
import {getYargsOption} from '../yargs';
import {ApiService} from './api.service';
import {DictionaryService} from './dictionary.service';
import {DsProcessorService} from './ds-processor.service';
import {MetadataFactory} from './entities/metadata.entity';
import {IndexerEvent} from './events';
import {FetchService} from './fetch.service';
import {IndexerSandbox, SandboxService} from './sandbox.service';
import {StoreService} from './store.service';
import {BlockContent} from './types';

const DEFAULT_DB_SCHEMA = 'public';

const logger = getLogger('indexer');
const {argv} = getYargsOption();

export class IndexerManager {
  private readonly apiService: ApiService;
  private fetchService: FetchService;
  private sandboxService: SandboxService;
  private readonly storeService: StoreService;
  private readonly sequelize: Sequelize;
  private readonly nodeConfig: NodeConfig;
  private readonly dsProcessorService: DsProcessorService;
  private readonly eventEmitter: EventEmitter2;
  private readonly dictionaryService: DictionaryService;
  protected indexerRepo: IndexerRepo;

  private api: ApiPromise;
  private indexerState: IndexerModel;
  private prevSpecVersion?: number;
  private filteredDataSources: SubstrateDatasource[];
  private readonly project: SubIndexProject;

  constructor(
    project: SubIndexProject,
    sequelize: Sequelize,
    nodeConfig: NodeConfig,
    indexerRepo: IndexerRepo,
    eventEmitter: EventEmitter2
  ) {
    this.project = project;
    this.sequelize = sequelize;
    this.nodeConfig = nodeConfig;
    this.indexerRepo = indexerRepo;
    this.eventEmitter = eventEmitter;

    this.dictionaryService = new DictionaryService(this.project);
    this.apiService = new ApiService(this.project, this.eventEmitter);
    this.dsProcessorService = new DsProcessorService(this.project);
    this.fetchService = new FetchService(
      this.project,
      this.nodeConfig,
      this.apiService,
      this.dsProcessorService,
      this.dictionaryService,
      this.eventEmitter
    );
    this.storeService = new StoreService(this.sequelize, this.nodeConfig);
    this.sandboxService = new SandboxService(this.nodeConfig);
  }

  @profiler(argv.profiler)
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
      await this.apiService.setBlockhash(block.block.hash);
      for (const ds of this.filteredDataSources) {
        const vm = await this.sandboxService.getDsProcessor(ds);
        if (isRuntimeDs(ds)) {
          await this.indexBlockForRuntimeDs(vm, ds.mapping.handlers, blockContent);
        } else if (isCustomDs(ds)) {
          await this.indexBlockForCustomDs(ds, vm, blockContent);
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

  async start(indexerName: string): Promise<void> {
    this.dsProcessorService.validateCustomDs();
    await this.apiService.init();
    await this.fetchService.init();
    this.api = this.apiService.getApi();
    this.indexerState = await this.ensureProject(indexerName);
    await this.initDbSchema();
    await this.ensureMetadata(this.indexerState.dbSchema);

    this.sandboxService.init(this.apiService, this.storeService, this.project);

    void this.fetchService.startLoop(this.indexerState.nextBlockHeight).catch((err) => {
      logger.error(err, 'failed to fetch block');
      // FIXME: retry before exit
      process.exit(1);
    });
    this.filteredDataSources = this.filterDataSources();
    this.fetchService.register((block) => this.indexBlock(block));
  }

  private getStartBlockFromDataSources() {
    const startBlocksList = this.getDataSourcesForSpecName().map((item) => item.startBlock ?? 1);
    if (startBlocksList.length === 0) {
      logger.error(`Failed to find a valid datasource, Please check your endpoint if specName filter is used.`);
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

  private async ensureProject(name: string): Promise<IndexerModel> {
    let project = await this.indexerRepo.findOne({
      where: {name},
    });
    const {chain, genesisHash} = this.apiService.networkMeta;
    if (!project) {
      let projectSchema: string;
      if (this.nodeConfig.localMode) {
        // create tables in default schema if local mode is enabled
        projectSchema = DEFAULT_DB_SCHEMA;
      } else {
        const suffix = await this.nextIndexerSchemaSuffix();
        projectSchema = `indexer_${suffix}`;
        const schemas = await this.sequelize.showAllSchemas(undefined);
        if (!(schemas as unknown as string[]).includes(projectSchema)) {
          await this.sequelize.createSchema(projectSchema, undefined);
        }
      }

      project = await this.indexerRepo.create({
        name,
        dbSchema: projectSchema,
        hash: '0x',
        nextBlockHeight: this.getStartBlockFromDataSources(),
        network: chain,
        networkGenesis: genesisHash,
      });
    } else {
      if (!project.networkGenesis || !project.network) {
        project.network = chain;
        project.networkGenesis = genesisHash;
        await project.save();
      } else if (project.networkGenesis !== genesisHash) {
        logger.error(`Not same network: genesisHash different - ${project.networkGenesis} : ${genesisHash}`);
        process.exit(1);
      }
    }
    return project;
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

  private filterDataSources(): SubstrateDatasource[] {
    let filteredDs = this.getDataSourcesForSpecName();
    if (filteredDs.length === 0) {
      logger.error(`Did not find any dataSource match with network specName ${this.api.runtimeVersion.specName}`);
      process.exit(1);
    }
    filteredDs = filteredDs.filter((ds) => ds.startBlock <= this.indexerState.nextBlockHeight);
    if (filteredDs.length === 0) {
      logger.error(
        `Your start block is greater than the current indexed block height in your database. Either change your startBlock (project.yaml) to <= ${this.indexerState.nextBlockHeight} or delete your database and start again from the currently specified startBlock`
      );
      process.exit(1);
    }
    // perform filter for custom ds
    filteredDs = filteredDs.filter((ds) => {
      if (isCustomDs(ds)) {
        return this.dsProcessorService.getDsProcessor(ds).dsFilterProcessor(ds, this.api);
      } else {
        return true;
      }
    });
    return filteredDs;
  }

  private getDataSourcesForSpecName(): SubstrateDatasource[] {
    return this.project.dataSources.filter(
      (ds) => !ds.filter?.specName || ds.filter.specName === this.api.runtimeVersion.specName.toString()
    );
  }

  private async indexBlockForRuntimeDs(
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

  private async indexBlockForCustomDs(
    ds: SubstrateCustomDatasource<string, SubstrateNetworkFilter>,
    vm: IndexerSandbox,
    {block, events, extrinsics}: BlockContent
  ): Promise<void> {
    const plugin = this.dsProcessorService.getDsProcessor(ds);
    for (const handler of ds.mapping.handlers) {
      const processor = plugin.handlerProcessors[handler.kind];
      if (isBlockHandlerProcessor(processor)) {
        const transformedOutput = processor.transformer(block, ds);
        if (processor.filterProcessor(handler.filter as any, transformedOutput, ds)) {
          await vm.securedExec(handler.handler, [transformedOutput]);
        }
      } else if (isCallHandlerProcessor(processor)) {
        const filteredExtrinsics = SubstrateUtil.filterExtrinsics(extrinsics, processor.baseFilter);
        for (const extrinsic of filteredExtrinsics) {
          const transformedOutput = processor.transformer(extrinsic, ds);
          if (processor.filterProcessor(handler.filter as any, transformedOutput, ds)) {
            await vm.securedExec(handler.handler, [transformedOutput]);
          }
        }
      } else if (isEventHandlerProcessor(processor)) {
        const filteredEvents = SubstrateUtil.filterEvents(events, processor.baseFilter);
        for (const event of filteredEvents) {
          const transformedOutput = processor.transformer(event, ds);
          if (processor.filterProcessor(handler.filter as any, transformedOutput, ds)) {
            await vm.securedExec(handler.handler, [transformedOutput]);
          }
        }
      }
    }
  }
}
