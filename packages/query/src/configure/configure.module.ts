import {DynamicModule, Global, Module} from '@nestjs/common';
import {Pool} from 'pg';
import {getLogger} from '../utils/logger';
import {getYargsOption} from '../yargs';
import {Config} from './config';

@Global()
@Module({})
export class ConfigureModule {
  static register(): DynamicModule {
    const {argv: opts} = getYargsOption();

    const config = new Config({
      name: opts.name,
      playground: opts.playground ?? false,
    });

    const pgPool = new Pool({
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASS ?? 'postgres',
      database: process.env.DB_DATABASE ?? 'postgres',
    });
    pgPool.on('error', (err) => {
      // tslint:disable-next-line no-console
      getLogger('db').error('PostgreSQL client generated error: ', err.message);
    });

    return {
      module: ConfigureModule,
      providers: [
        {
          provide: Config,
          useValue: config,
        },
        {
          provide: Pool,
          useValue: pgPool,
        },
      ],
      exports: [Config, Pool],
    };
  }
}
