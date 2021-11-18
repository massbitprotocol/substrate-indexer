import {InjectQueue} from '@nestjs/bull';
import {Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post} from '@nestjs/common';
import {Queue} from 'bull';
import {v4 as uuidv4} from 'uuid';
import {DeployIndexerDto, DeployIndexerResponseDto, IndexerDto} from '../dto';
import {IndexerRepo} from '../entities';

@Controller('indexers')
export class IndexerController {
  constructor(
    @InjectQueue('indexer') private readonly indexerQueue: Queue,
    @Inject('Indexer') protected indexerRepo: IndexerRepo
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createIndexer(@Body() data: DeployIndexerDto): Promise<DeployIndexerResponseDto> {
    data.id = uuidv4();
    await this.indexerQueue.add(data);
    return new DeployIndexerResponseDto({id: data.id});
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getIndexerList(): Promise<IndexerDto[]> {
    const indexers = await this.indexerRepo.findAll();
    return indexers.map(({description, id, name, repository}) => {
      return new IndexerDto({id, name, description, repository});
    });
  }

  @Get('/:id')
  @HttpCode(HttpStatus.OK)
  async getIndexerById(@Param('id') id: string): Promise<IndexerDto> {
    const indexer = await this.indexerRepo.findOne({where: {id}});
    const {description, name, repository} = indexer;
    return new IndexerDto({id, name, description, repository});
  }
}
