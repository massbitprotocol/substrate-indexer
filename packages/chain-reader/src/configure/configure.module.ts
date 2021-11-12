import assert from 'assert';
import path from 'path';
import { INetworkConfig, Project } from '@massbit/common';
import { DynamicModule, Global, Module } from '@nestjs/common';
import { camelCase, last, omitBy, isNil } from 'lodash';
import { getLogger, setLevel } from '../utils/logger';
import { getYargsOption } from '../yargs';
import { IConfig, MinConfig, Config } from './config';

const YargsNameMapping = {
  local: 'localMode',
};

type Args = ReturnType<typeof getYargsOption>['argv'];

function yargsToIConfig(yargs: Args): Partial<IConfig> {
  return Object.entries(yargs).reduce((acc, [key, value]) => {
    if (['_', '$0'].includes(key)) return acc;

    if (key === 'network-registry') {
      try {
        value = JSON.parse(value as string);
      } catch (e) {
        throw new Error('Argument `network-registry` is not valid JSON');
      }
    }
    acc[YargsNameMapping[key] ?? camelCase(key)] = value;
    return acc;
  }, {});
}

function defaultIndexerName(config: Partial<IConfig>): MinConfig {
  return {
    ...config,
    indexerName:
      config.indexerName ?? last(path.resolve(config.indexer).split(path.sep)),
  } as MinConfig;
}

const logger = getLogger('configure');

@Global()
@Module({})
export class ConfigureModule {
  static register(): DynamicModule {
    const yargsOptions = getYargsOption();
    const { argv } = yargsOptions;
    if (!argv.indexer) {
      logger.error(
        'indexer path is missing neither in cli options nor in config file',
      );
      yargsOptions.showHelp();
      process.exit(1);
    }
    assert(argv.indexer, 'indexer path is missing');
    const config = new Config(defaultIndexerName(yargsToIConfig(argv)));

    if (config.debug) {
      setLevel('debug');
    }

    const projectPath = path.resolve('.', config.indexer);

    const project = async () => {
      const p = await Project.create(
        projectPath,
        omitBy<INetworkConfig>(
          {
            endpoint: config.networkEndpoint,
          },
          isNil,
        ),
      ).catch((err) => {
        logger.error(err, 'Create network indexer from given path failed!');
        process.exit(1);
      });

      return p;
    };

    return {
      module: ConfigureModule,
      providers: [
        {
          provide: Config,
          useValue: config,
        },
        {
          provide: Project,
          useFactory: project,
        },
      ],
      exports: [Config, Project],
    };
  }
}
