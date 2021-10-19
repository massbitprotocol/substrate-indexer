import {Module} from '@nestjs/common';
import {DbModule} from '../db/db.module';
import {ApiService} from './api.service';
import {DictionaryService} from './dictionary.service';
import {DsProcessorService} from './ds-processor.service';
import {FetchService} from './fetch.service';
import {IndexerManager} from './indexer.manager';
import {SandboxService} from './sandbox.service';
import {StoreService} from './store.service';

@Module({
  imports: [DbModule.forFeature(['Indexer'])],
  providers: [
    IndexerManager,
    StoreService,
    ApiService,
    FetchService,
    DictionaryService,
    SandboxService,
    DsProcessorService,
  ],
  exports: [],
})
export class IndexerModule {}
