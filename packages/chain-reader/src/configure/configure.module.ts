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

export function validDbSchemaName(name: string): boolean {
  if (name.length === 0) {
    return false;
  } else {
    name = name.toLowerCase();
    const regexp = new RegExp('^[a-zA-Z_][a-zA-Z0-9_\\-\\/]{0,62}$');
    const flag0 = !name.startsWith('pg_'); // Reserved identifier
    const flag1 = regexp.test(name); // <= Valid characters, less than 63 bytes
    if (!flag0) {
      logger.error(
        `Invalid schema name '${name}', schema name must not be prefixed with 'pg_'`,
      );
    }
    if (!flag1) {
      logger.error(
        `Invalid schema name '${name}', schema name must start with a letter or underscore,
         be less than 63 bytes and must contain only valid alphanumeric characters (can include characters '_-/')`,
      );
    }
    return flag0 && flag1;
  }
}

const logger = getLogger('configure');

@Global()
@Module({})
export class ConfigureModule {
  static register(): DynamicModule {
    const yargsOptions = getYargsOption();
    const { argv } = yargsOptions;
    if (!argv.indexer) {
      logger.error('indexer path is missing neither in CLI options');
      yargsOptions.showHelp();
      process.exit(1);
    }
    const config = new Config(defaultIndexerName(yargsToIConfig(argv)));

    if (!validDbSchemaName(config.dbSchema)) {
      process.exit(1);
    }

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
        logger.error(err, 'create project from given path failed');
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
