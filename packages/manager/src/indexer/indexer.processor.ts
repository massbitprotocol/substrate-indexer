import {execSync} from 'child_process';
import fs from 'fs';
import path from 'path';
import {INetworkConfig, Project} from '@massbit/common';
import {Process, Processor} from '@nestjs/bull';
import {Inject, Injectable} from '@nestjs/common';
import {EventEmitter2} from '@nestjs/event-emitter';
import {Job} from 'bull';
import {isNil, omitBy} from 'lodash';
import Piscina from 'piscina';
import {Sequelize} from 'sequelize';
import {Config} from '../configure/config';
import {IndexerRepo} from '../entities';
import {getLogger} from '../utils/logger';
import {IndexerManager} from './indexer.manager';
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
    const {url} = job.data;
    const projectPath = this.cloneProject(url);
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

    const piscina = new Piscina({
      filename: path.resolve(__dirname, 'worker.js'),
    });

    logger.info('build indexer...');
    await (async function () {
      await piscina.run({projectPath});
    })();

    // const indexer = new IndexerManager(project, this.sequelize, this.nodeConfig, this.indexerRepo, this.eventEmitter);
    // await indexer.start();
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
      execSync(cmd, {cwd: srcDir, stdio: 'ignore'});
    } catch (e) {
      logger.error(`failed to run command \`${cmd}\`: ${e}`);
    }
  }
}
