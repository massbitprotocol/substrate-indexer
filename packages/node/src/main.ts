import {NestFactory} from '@nestjs/core';
import {AppModule} from './app.module';
import {IndexerManager} from './indexer/indexer.manager';
import {getLogger, NestLogger} from './utils/logger';
import {argv} from './yargs';

async function bootstrap() {
  const debug = argv('debug');
  try {
    const app = await NestFactory.create(AppModule, {
      logger: debug ? new NestLogger() : false,
    });
    await app.init();
    const indexerManager = app.get(IndexerManager);
    await indexerManager.start();
    await app.listen(3000);
    getLogger('massbit-node').info('node started');
  } catch (e) {
    getLogger('massbit-node').error(e, 'node failed to start');
    process.exit(1);
  }
}

void bootstrap();
