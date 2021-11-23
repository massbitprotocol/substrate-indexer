import {execSync} from 'child_process';
import fs from 'fs';
import path from 'path';
import {INetworkConfig, Project} from '@massbit/common';
import {Inject, Injectable} from '@nestjs/common';
import {EventEmitter2, OnEvent} from '@nestjs/event-emitter';
import {isNil, omitBy} from 'lodash';
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
    logger.info('fetch project from GitHub');
    const projectPath = this.cloneProject(data.repository);

    const project = await Project.create(
      projectPath,
      omitBy<INetworkConfig>(
        {
          endpoint: this.config.networkEndpoint,
          networkIndexer: this.config.networkIndexer,
        },
        isNil
      )
    ).catch((err) => {
      logger.error(err, 'Create project from given path failed!');
      process.exit(1);
    });

    logger.info(`install indexer's dependencies...`);
    this.runCmd(projectPath, `npm install`);

    logger.info('build indexer...');
    this.runCmd(projectPath, `npm run build`);

    logger.info(`start indexer ${project.name}`);
    const indexer = new IndexerInstance(project, this.sequelize, this.config, this.indexerRepo, this.eventEmitter);
    await indexer.start(data);
  }

  cloneProject(url: string): string {
    const projectsDir = path.resolve(process.env.PROJECTS_DIR ?? '../../../projects');
    if (!fs.existsSync(projectsDir)) {
      fs.mkdirSync(projectsDir);
    }
    const projectName = `${Date.now()}`;
    this.runCmd(projectsDir, `git clone ${url} ${projectName}`);
    return path.join(projectsDir, projectName);
  }

  runCmd(srcDir: string, cmd: string): void {
    try {
      execSync(cmd, {cwd: srcDir, stdio: 'inherit'});
    } catch (e) {
      logger.error(`failed to run command \`${cmd}\`: ${e}`);
    }
  }
}
