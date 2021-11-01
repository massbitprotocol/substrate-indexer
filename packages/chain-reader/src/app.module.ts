import {Module, OnModuleDestroy} from '@nestjs/common';
import {ConfigModule, ConfigService} from '@nestjs/config';
import {TypeOrmModule, TypeOrmModuleOptions} from '@nestjs/typeorm';
import {getConnectionManager} from 'typeorm';
import {ChainReaderModule} from './chain-reader/chain-reader.module';
import configurations from './config';
import {configDb} from './config/consts';
import {ConfigureModule} from './configure/configure.module';

const {NODE_ENV} = process.env;

@Module({
  imports: [
    ConfigModule.forRoot({
      load: configurations,
      isGlobal: true,
      envFilePath: [`.env${NODE_ENV ? `.${NODE_ENV}` : ''}`],
    }),
    ConfigureModule.register(),
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        const config = configService.get<TypeOrmModuleOptions>(configDb);
        if (!config) {
          throw new Error('Cannot start app without database config');
        }
        return config;
      },
      inject: [ConfigService],
    }),
    ChainReaderModule,
  ],
  controllers: [],
})
export class AppModule implements OnModuleDestroy {
  onModuleDestroy(): void {
    const db = getConnectionManager();
    if (db) {
      db.connections.forEach((c) => c.close());
    }
  }
}
