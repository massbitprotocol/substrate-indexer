import path from 'path';
import {ProjectNetworkConfig} from '@massbit/common';
import {Process, Processor} from '@nestjs/bull';
import {Inject, Injectable} from '@nestjs/common';
import {EventEmitter2} from '@nestjs/event-emitter';
import {Job} from 'bull';
import {isNil, omitBy} from 'lodash';
import {Sequelize} from 'sequelize';
import {NodeConfig} from '../configure/node-config';
import {SubIndexProject} from '../configure/project.model';
import {IndexerRepo} from '../entities';
import {getLogger} from '../utils/logger';
import {IndexerManager} from './indexer.manager';

const logger = getLogger('indexer-processor');

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
    const projectPath = path.resolve('.', job.data.projectPath);
    const project = await SubIndexProject.create(
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
    await indexer.start(job.data.indexerName);
  }
}
