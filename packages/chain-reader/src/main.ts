import {NestFactory} from '@nestjs/core';
import {AppModule} from './app.module';
import {ChainReader} from './chain-reader/chain-reader.service';
import {getLogger, NestLogger} from './utils/logger';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule, {
      logger: new NestLogger(),
    });
    await app.init();
    const chainReader = app.get(ChainReader);
    await chainReader.start();
    getLogger('chain-reader').info('service started');
  } catch (e) {
    getLogger('chain-reader').error(e, 'service failed to start');
    process.exit(1);
  }
}

void bootstrap();
