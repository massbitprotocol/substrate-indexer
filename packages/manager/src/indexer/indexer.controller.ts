import {InjectQueue} from '@nestjs/bull';
import {Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post} from '@nestjs/common';
import {Queue} from 'bull';
import {v4 as uuidv4} from 'uuid';
import {DeployIndexerDto, DeployIndexerResponse, IndexerDto} from '../dto';
import {IndexerRepo} from '../entities';

@Controller('indexers')
export class IndexerController {
  constructor(
    @InjectQueue('indexer') private readonly indexerQueue: Queue,
    @Inject('Indexer') protected indexerRepo: IndexerRepo
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createIndexer(@Body() data: DeployIndexerDto): Promise<DeployIndexerResponse> {
    const id = uuidv4();
    await this.indexerQueue.add({id, ...data});
    return new DeployIndexerResponse({id});
  }

  @Get('/:id')
  @HttpCode(HttpStatus.OK)
  async getIndexerById(@Param('id') id: string): Promise<IndexerDto> {
    const indexer = await this.indexerRepo.findOne({where: {id}});
    const {name} = indexer;
    return new IndexerDto({id, name});
  }
}
