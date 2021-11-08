import {NestFactory} from '@nestjs/core';
import {AppModule} from './app.module';
import {NestLogger} from './utils/logger';

void (async () => {
  const app = await NestFactory.create(AppModule, {
    logger: new NestLogger(),
  });
  await app.listen(process.env.PORT ?? 3001);
})();
