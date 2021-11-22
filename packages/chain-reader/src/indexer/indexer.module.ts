import { Project } from '@massbit/common';
import { Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DbModule } from '../db/db.module';
import { ApiService } from './api.service';
import { FetchService } from './fetch.service';
import { IndexerManager } from './indexer.manager';
import { SandboxService } from './sandbox.service';
import { StoreService } from './store.service';

@Module({
  imports: [DbModule.forFeature(['Indexer'])],
  providers: [
    IndexerManager,
    StoreService,
    {
      provide: ApiService,
      useFactory: async (project: Project, eventEmitter: EventEmitter2) => {
        const apiService = new ApiService(project, eventEmitter);
        await apiService.init();
        return apiService;
      },
      inject: [Project, EventEmitter2],
    },
    FetchService,
    SandboxService,
  ],
  exports: [StoreService],
})
export class IndexerModule {}
