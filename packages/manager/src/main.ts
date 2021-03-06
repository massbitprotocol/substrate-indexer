import {ValidationError, ValidationPipe} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {AppModule} from './app.module';
import {MassbitBadRequestException} from './exception';
import {getLogger, NestLogger} from './utils/logger';
import {argv} from './yargs';

async function bootstrap() {
  const debug = argv('debug');
  try {
    const app = await NestFactory.create(AppModule, {
      logger: debug ? new NestLogger() : false,
      cors: true,
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: (errors: ValidationError[]): MassbitBadRequestException => {
          return MassbitBadRequestException.fromValidationErrors(errors);
        },
      })
    );
    await app.init();
    await app.listen(parseInt(process.env.PORT, 10) || 3000);
    getLogger('indexer-manager').info('service started');
  } catch (e) {
    getLogger('indexer-manager').error(e, 'service failed to start');
    process.exit(1);
  }
}

void bootstrap();
