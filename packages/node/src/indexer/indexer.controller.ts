import {InjectQueue} from '@nestjs/bull';
import {Body, Controller, HttpCode, HttpStatus, Post} from '@nestjs/common';
import {Queue} from 'bull';

@Controller('indexers')
export class IndexerController {
  constructor(@InjectQueue('indexer') private readonly indexerQueue: Queue) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createIndexer(
    @Body('projectPath') projectPath: string,
    @Body('indexerName') indexerName: string
  ): Promise<void> {
    await this.indexerQueue.add({projectPath, indexerName});
  }
}
