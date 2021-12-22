import {Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Request, UseGuards} from '@nestjs/common';
import {EventEmitter2} from '@nestjs/event-emitter';
import {v4 as uuidv4} from 'uuid';
import {JwtAuthGuard} from '../auth/jwt-auth.guard';
import {CreateIndexerDto, CreateIndexerResponseDto, IndexerDto} from '../dto';
import {IndexerRepo, IndexerStatus} from '../entities';
import {IndexerEvent} from './events';

@Controller('indexers')
export class IndexerController {
  constructor(@Inject('Indexer') protected indexerRepo: IndexerRepo, private eventEmitter: EventEmitter2) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createIndexer(@Request() req, @Body() data: CreateIndexerDto): Promise<CreateIndexerResponseDto> {
    const {name} = data;
    const indexer = await this.indexerRepo.findOne({
      where: {name},
      attributes: {include: ['id']},
    });
    if (indexer) {
      throw new Error(`Indexer with name ${name} is already existed`);
    }
    const id = uuidv4();
    await this.indexerRepo.create({id, userId: req.user.userId, status: IndexerStatus.DRAFT, ...data});
    return new CreateIndexerResponseDto({id});
  }

  @UseGuards(JwtAuthGuard)
  @Post('/:id/deploy')
  @HttpCode(HttpStatus.OK)
  async deployIndexer(@Request() req, @Param('id') id: string): Promise<void> {
    const indexer = await this.indexerRepo.findOne({
      where: {id},
      attributes: {include: ['id', 'userId', 'status']},
    });
    if (!indexer) {
      throw new Error(`Indexer not found`);
    }

    if (indexer.userId !== req.user.userId) {
      throw new Error(``);
    }

    if (indexer.status !== IndexerStatus.DRAFT) {
      throw new Error('Indexer is already deployed');
    }

    indexer.status = IndexerStatus.DEPLOYING;
    await indexer.save();

    this.eventEmitter.emit(IndexerEvent.IndexerDeployed, id);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getIndexerList(): Promise<IndexerDto[]> {
    const indexers = await this.indexerRepo.findAll();
    return indexers.map(({description, id, imageUrl, name, repository}) => {
      return new IndexerDto({id, name, description, repository, imageUrl});
    });
  }

  @Get('/:id')
  @HttpCode(HttpStatus.OK)
  async getIndexerById(@Param('id') id: string): Promise<IndexerDto> {
    const indexer = await this.indexerRepo.findOne({where: {id}});
    const {description, imageUrl, name, repository, status} = indexer;
    return new IndexerDto({id, name, description, repository, imageUrl, status});
  }
}
