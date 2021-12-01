import {execSync} from 'child_process';
import fs from 'fs';
import path from 'path';
import {INetworkConfig, Project} from '@massbit/common';
import {Inject, Injectable} from '@nestjs/common';
import {EventEmitter2, OnEvent} from '@nestjs/event-emitter';
import {isNil, omitBy} from 'lodash';
import {StaticPool} from 'node-worker-threads-pool';
import {Sequelize} from 'sequelize';
import {Config} from '../configure/config';
import {DeployIndexerDto} from '../dto';
import {IndexerRepo} from '../entities';
import {getLogger} from '../utils/logger';
import {IndexerEvent} from './events';
import {IndexerInstance} from './indexer';

const logger = getLogger('indexer-manager');

@Injectable()
export class IndexerManager {
  constructor(
    private sequelize: Sequelize,
    private config: Config,
    @Inject('Indexer') protected indexerRepo: IndexerRepo,
    private eventEmitter: EventEmitter2
  ) {}

  @OnEvent(IndexerEvent.IndexerDeployed, {async: true})
  async handleIndexerDeployment(data: DeployIndexerDto): Promise<void> {
    try {
      const projectPath = await this.fetchGithubRepo(data.repository);
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

      logger.info(`install dependencies and build indexer`);
      await pool.exec(projectPath);

      logger.info(`start indexer ${project.name}`);
      const indexer = new IndexerInstance(project, this.sequelize, this.config, this.indexerRepo, this.eventEmitter);
      await indexer.start(data);
    } catch (err) {
      logger.error(err, `deploy indexer ${data.id} failed`);
    }
  }

  async fetchGithubRepo(url: string): Promise<string> {
    logger.info('fetch project from GitHub repository');
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
}
