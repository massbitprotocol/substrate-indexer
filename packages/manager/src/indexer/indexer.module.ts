import {Module} from '@nestjs/common';
import {DbModule} from '../db/db.module';
import {IndexerController} from './indexer.controller';
import {IndexerProcessor} from './indexer.processor';

@Module({
  imports: [DbModule.forFeature(['Indexer'])],
  providers: [IndexerProcessor],
  controllers: [IndexerController],
  exports: [],
})
export class IndexerModule {}
