import {InjectQueue} from '@nestjs/bull';
import {Controller, HttpCode, HttpStatus, Post} from '@nestjs/common';
import {Queue} from 'bull';
import {IndexerManager} from './indexer.manager';

@Controller('indexers')
export class IndexerController {
  constructor(@InjectQueue('indexer') private readonly indexerQueue: Queue) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createIndexer(): Promise<void> {
    await this.indexerQueue.add({});
  }
}
