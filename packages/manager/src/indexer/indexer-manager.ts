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
      logger.info('fetch project from GitHub repository...');
      const projectPath = this.cloneGithubRepo(data.repository);

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
        task: path.resolve(__dirname, 'worker.js'),
      });

      logger.info(`install dependencies and build indexer...`);
      await pool.exec(projectPath);

      logger.info(`start indexer ${project.name}`);
      const indexer = new IndexerInstance(project, this.sequelize, this.config, this.indexerRepo, this.eventEmitter);
      await indexer.start(data);
    } catch (err) {
      logger.error(err, `deploy indexer ${data.id} failed`);
    }
  }

  cloneGithubRepo(url: string): string {
    const projectsDir = path.resolve(process.env.PROJECTS_DIR ?? '../../../projects');
    if (!fs.existsSync(projectsDir)) {
      fs.mkdirSync(projectsDir);
    }
    const projectName = `${Date.now()}`;
    this.runCmd(projectsDir, `git clone ${url} ${projectName}`);
    return path.join(projectsDir, projectName);
  }

  runCmd(srcDir: string, cmd: string): void {
    execSync(cmd, {cwd: srcDir, stdio: 'ignore'});
  }
}
