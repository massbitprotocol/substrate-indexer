import {InjectQueue} from '@nestjs/bull';
import {Controller, HttpCode, HttpStatus, Post, UploadedFile, UseInterceptors} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {Queue} from 'bull';
import {Express} from 'express';
import {diskStorage} from 'multer';

@Controller('indexers')
export class IndexerController {
  constructor(@InjectQueue('indexer') private readonly indexerQueue: Queue) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: process.env.PROJECTS_DIR ?? './projects',
      }),
    })
  )
  @HttpCode(HttpStatus.CREATED)
  async createIndexer(@UploadedFile() file: Express.Multer.File): Promise<void> {
    await this.indexerQueue.add({file});
  }
}
