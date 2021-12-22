import {Module} from '@nestjs/common';
import {APP_FILTER} from '@nestjs/core';
import {EventEmitterModule} from '@nestjs/event-emitter';
import {ScheduleModule} from '@nestjs/schedule';
import {AuthModule} from './auth/auth.module';
import {ConfigureModule} from './configure/configure.module';
import {DbModule} from './db/db.module';
import {GlobalHandleExceptionFilter} from './exception';
import {IndexerModule} from './indexer/indexer.module';

export class NodeOption {}

@Module({
  imports: [
    ConfigureModule.forRoot(),
    DbModule.forRoot({
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
      username: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASS ?? 'postgres',
      database: process.env.DB_DATABASE ?? 'postgres',
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    IndexerModule,
    AuthModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalHandleExceptionFilter,
    },
  ],
  controllers: [],
})
export class AppModule {}
