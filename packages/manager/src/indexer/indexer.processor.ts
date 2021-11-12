import {execSync} from 'child_process';
import path from 'path';
import {INetworkConfig, Project} from '@massbit/common';
import {Process, Processor} from '@nestjs/bull';
import {Inject, Injectable} from '@nestjs/common';
import {EventEmitter2} from '@nestjs/event-emitter';
import admZip from 'adm-zip';
import {Job} from 'bull';
import {Express} from 'express';
import {isNil, omitBy} from 'lodash';
import {Sequelize} from 'sequelize';
import {Config} from '../configure/config';
import {IndexerRepo} from '../entities';
import {getLogger} from '../utils/logger';
import {IndexerManager} from './indexer.manager';
import 'multer';

const logger = getLogger('indexer-manager');

@Injectable()
@Processor('indexer')
export class IndexerProcessor {
  constructor(
    private sequelize: Sequelize,
    private nodeConfig: Config,
    @Inject('Indexer') protected indexerRepo: IndexerRepo,
    private eventEmitter: EventEmitter2
  ) {}

  @Process()
  async handleIndexer(job: Job): Promise<void> {
    logger.info('handle indexer deployment');

    const {file} = job.data;
    let projectPath = this.extractProject(file);
    projectPath = path.resolve('.', projectPath);
    const project = await Project.create(
      projectPath,
      omitBy<INetworkConfig>(
        {
          endpoint: this.nodeConfig.networkEndpoint,
          networkIndexer: this.nodeConfig.networkIndexer,
        },
        isNil
      )
    ).catch((err) => {
      logger.error(err, 'Create project from given path failed!');
      process.exit(1);
    });

    const indexer = new IndexerManager(project, this.sequelize, this.nodeConfig, this.indexerRepo, this.eventEmitter);

    logger.info("install indexer's dependencies...");
    this.exec(projectPath, `yarn install`);

    logger.info('build indexer...');
    this.exec(projectPath, `yarn run build`);

    logger.info('start indexer');
    await indexer.start();
  }

  extractProject(file: Express.Multer.File): string {
    const projectsDir = process.env.PROJECTS_DIR ?? '../../../projects';
    const unzip = new admZip(file.path);
    const projectPath = `${projectsDir}/${file.originalname}`;
    unzip.extractAllTo(projectPath, true);
    return projectPath;
  }

  exec(srcDir: string, cmd: string) {
    try {
      return execSync(cmd, {cwd: srcDir, stdio: 'ignore'});
    } catch (e) {
      logger.error(`failed to run command \`${cmd}\``);
    }
  }
}
