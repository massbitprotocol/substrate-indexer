import {InjectQueue} from '@nestjs/bull';
import {Body, Controller, HttpCode, HttpStatus, Post} from '@nestjs/common';
import {Queue} from 'bull';
import {DeployIndexerDto} from '../dto';

@Controller('indexers')
export class IndexerController {
  constructor(@InjectQueue('indexer') private readonly indexerQueue: Queue) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createIndexer(@Body() data: DeployIndexerDto): Promise<void> {
    await this.indexerQueue.add(data);
  }
}
