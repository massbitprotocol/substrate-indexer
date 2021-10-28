import {NestFactory} from '@nestjs/core';
import {AppModule} from './app.module';
import {ChainReader} from './chain-reader/chain-reader.service';

import {getLogger} from './utils/logger';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);
    await app.init();
    const chainReader = app.get(ChainReader);
    await chainReader.start();
    getLogger('chain-reader').info('chain-reader started');
  } catch (e) {
    getLogger('chain-reader').error(e, 'chain-reader failed to start');
    process.exit(1);
  }
}

void bootstrap();
