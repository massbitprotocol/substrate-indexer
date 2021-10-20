import {BullModule} from '@nestjs/bull';
import {Module} from '@nestjs/common';
import {DbModule} from '../db/db.module';
import {ApiService} from './api.service';
import {DictionaryService} from './dictionary.service';
import {DsProcessorService} from './ds-processor.service';
import {FetchService} from './fetch.service';
import {IndexerController} from './indexer.controller';
import {IndexerManager} from './indexer.manager';
import {SandboxService} from './sandbox.service';
import {StoreService} from './store.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'indexer',
    }),
    DbModule.forFeature(['Indexer']),
  ],
  providers: [
    IndexerManager,
    StoreService,
    ApiService,
    FetchService,
    DictionaryService,
    SandboxService,
    DsProcessorService,
  ],
  controllers: [IndexerController],
  exports: [],
})
export class IndexerModule {}
