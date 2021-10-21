import {BullModule} from '@nestjs/bull';
import {Module} from '@nestjs/common';
import {DbModule} from '../db/db.module';
import {IndexerController} from './indexer.controller';
import {IndexerProcessor} from './indexer.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'indexer',
    }),
    DbModule.forFeature(['Indexer']),
  ],
  providers: [IndexerProcessor],
  controllers: [IndexerController],
  exports: [],
})
export class IndexerModule {}
