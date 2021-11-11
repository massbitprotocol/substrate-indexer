import {DynamicModule, Global, Module} from '@nestjs/common';
import {camelCase} from 'lodash';
import {setLevel} from '../utils/logger';
import {getYargsOption} from '../yargs';
import {IConfig, Config} from './config';

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

@Global()
@Module({})
export class ConfigureModule {
  static register(): DynamicModule {
    const yargsOptions = getYargsOption();
    const {argv} = yargsOptions;
    let config: Config;
    if (argv.config) {
      config = Config.fromFile(argv.config, yargsToIConfig(argv));
    } else {
      config = new Config({...yargsToIConfig(argv)} as IConfig);
    }

    if (config.debug) {
      setLevel('debug');
    }

    return {
      module: ConfigureModule,
      providers: [
        {
          provide: Config,
          useValue: config,
        },
      ],
      exports: [Config],
    };
  }
}
