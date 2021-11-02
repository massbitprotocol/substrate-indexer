import path from 'path';
import {ProjectNetworkConfig} from '@massbit/common';
import {Process, Processor} from '@nestjs/bull';
import {Inject, Injectable} from '@nestjs/common';
import {EventEmitter2} from '@nestjs/event-emitter';
import admZip from 'adm-zip';
import {Job} from 'bull';
import {Express} from 'express';
import {isNil, omitBy} from 'lodash';
import {Sequelize} from 'sequelize';
import {NodeConfig} from '../configure/node-config';
import {IndexerRepo} from '../entities';
import {getLogger} from '../utils/logger';
import {IndexerManager} from './indexer.manager';
import {Project} from './project.model';
import 'multer';

const logger = getLogger('indexer-processor');
const projectsDir = './projects';

@Injectable()
@Processor('indexer')
export class IndexerProcessor {
  constructor(
    private sequelize: Sequelize,
    private nodeConfig: NodeConfig,
    @Inject('Indexer') protected indexerRepo: IndexerRepo,
    private eventEmitter: EventEmitter2
  ) {}

  @Process()
  async handleIndexer(job: Job): Promise<void> {
    const {file} = job.data;
    let projectPath = this.extractProject(file);
    projectPath = path.resolve('.', projectPath);
    const project = await Project.create(
      projectPath,
      omitBy<ProjectNetworkConfig>(
        {
          endpoint: this.nodeConfig.networkEndpoint,
          dictionary: this.nodeConfig.networkDictionary,
        },
        isNil
      )
    ).catch((err) => {
      logger.error(err, 'Create project from given path failed!');
      process.exit(1);
    });

    const indexer = new IndexerManager(project, this.sequelize, this.nodeConfig, this.indexerRepo, this.eventEmitter);
    logger.info(`deploy indexer ${project.projectManifest.name}`);
    await indexer.start();
  }

  extractProject(file: Express.Multer.File): string {
    const unzip = new admZip(file.path);
    unzip.extractAllTo(projectsDir, true);
    const projectName = file.originalname.split('.')[0];
    return `${projectsDir}/${projectName}`;
  }
}