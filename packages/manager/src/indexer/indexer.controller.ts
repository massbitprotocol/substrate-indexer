import {Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post} from '@nestjs/common';
import {EventEmitter2} from '@nestjs/event-emitter';
import {v4 as uuidv4} from 'uuid';
import {DeployIndexerDto, DeployIndexerResponseDto, IndexerDto} from '../dto';
import {IndexerRepo} from '../entities';
import {IndexerEvent} from './events';

@Controller('indexers')
export class IndexerController {
  constructor(@Inject('Indexer') protected indexerRepo: IndexerRepo, private eventEmitter: EventEmitter2) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createIndexer(@Body() data: DeployIndexerDto): DeployIndexerResponseDto {
    data.id = uuidv4();
    this.eventEmitter.emit(IndexerEvent.IndexerDeployed, data);
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
