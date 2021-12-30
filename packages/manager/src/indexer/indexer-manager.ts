import fs from 'fs';
import path from 'path';
import {INetworkConfig, Project} from '@massbit/common';
import {Inject, Injectable} from '@nestjs/common';
import {EventEmitter2, OnEvent} from '@nestjs/event-emitter';
import {SchedulerRegistry} from '@nestjs/schedule';
import {isNil, omitBy} from 'lodash';
import {StaticPool} from 'node-worker-threads-pool';
import {Sequelize} from 'sequelize';
import {Config} from '../configure/config';
import {IndexerRepo, IndexerStatus} from '../entities';
import {getLogger} from '../utils/logger';
import {IndexerEvent} from './events';
import {IndexerInstance} from './indexer-instance';

@Injectable()
export class IndexerManager {
  private readonly indexers: Record<string, IndexerInstance> = {};

  constructor(
    private sequelize: Sequelize,
    private config: Config,
    @Inject('Indexer') protected indexerRepo: IndexerRepo,
    private eventEmitter: EventEmitter2,
    private schedulerRegistry: SchedulerRegistry
  ) {}

  @OnEvent(IndexerEvent.IndexerDeployed, {async: true})
  async handleIndexerDeployment(id: string): Promise<void> {
    const indexer = await this.indexerRepo.findOne({where: {id}});
    const logger = getLogger(indexer.name);
    try {
      logger.info('fetch indexer from GitHub repository');
      const projectPath = await this.fetchGithubRepo(indexer.repository);
      const project = await Project.create(
        projectPath,
        omitBy<INetworkConfig>(
          {
            endpoint: this.config.networkEndpoint,
            networkIndexer: this.config.networkIndexer,
          },
          isNil
        )
      );

      const pool = new StaticPool({
        size: 1,
        task: path.resolve(__dirname, 'workers/build.js'),
      });

      logger.info(`install dependencies and build`);
      await pool.exec(projectPath);

      logger.info(`start indexing`);
      this.indexers[id] = new IndexerInstance(
        id,
        project,
        this.sequelize,
        this.config,
        this.indexerRepo,
        this.eventEmitter,
        this.schedulerRegistry
      );
      await this.indexers[id].start();
    } catch (err) {
      logger.error(err, `failed to deploy indexer`);
      indexer.status = IndexerStatus.FAILED;
      indexer.error = `${err}`;
      await indexer.save();
    }
  }

  async fetchGithubRepo(url: string): Promise<string> {
    const projectsDir = path.resolve(process.env.PROJECTS_DIR ?? '../../../projects');
    if (!fs.existsSync(projectsDir)) {
      fs.mkdirSync(projectsDir);
    }
    const name = `${Date.now()}`;
    const pool = new StaticPool({
      size: 1,
      task: path.resolve(__dirname, 'workers/github.js'),
    });
    await pool.exec({projectsDir, url, name});
    return path.join(projectsDir, name);
  }

  @OnEvent(IndexerEvent.IndexerStopped, {async: true})
  async handleIndexerStop(id: string): Promise<void> {
    await this.indexers[id].stop();
  }
}
