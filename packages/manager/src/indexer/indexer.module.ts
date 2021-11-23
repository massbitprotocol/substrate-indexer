import {Module} from '@nestjs/common';
import {DbModule} from '../db/db.module';
import {IndexerManager} from './indexer-manager';
import {IndexerController} from './indexer.controller';

@Module({
  imports: [DbModule.forFeature(['Indexer'])],
  providers: [IndexerManager],
  controllers: [IndexerController],
  exports: [],
})
export class IndexerModule {}
