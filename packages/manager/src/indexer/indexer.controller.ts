import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import {EventEmitter2} from '@nestjs/event-emitter';
import {v4 as uuidv4} from 'uuid';
import {JwtAuthGuard} from '../auth/jwt-auth.guard';
import {CreateIndexerDto, CreateIndexerResponseDto, IndexerDto} from '../dto';
import {IndexerRepo, IndexerStatus} from '../entities';
import {MassbitBadRequestException, MassbitForbiddenException, MassbitNotFoundException} from '../exception';
import {Validator} from '../validator';
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
      throw new MassbitBadRequestException(`Indexer with name ${name} is already existed`);
    }
    const validator = new Validator(data.repository);
    const reports = await validator.getValidationReports();
    for (const report of reports) {
      if (!report.valid) {
        throw new MassbitBadRequestException(report.description);
      }
    }
    const id = uuidv4();
    await this.indexerRepo.create({...data, id, userId: req.user.userId, status: IndexerStatus.DRAFT});
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
      throw new MassbitNotFoundException(`Indexer not found`);
    }

    if (indexer.userId !== req.user.userId) {
      throw new MassbitForbiddenException('');
    }

    if (indexer.status !== IndexerStatus.DRAFT) {
      throw new MassbitBadRequestException('Indexer is already deployed');
    }

    indexer.status = IndexerStatus.DEPLOYING;
    await indexer.save();
    this.eventEmitter.emit(IndexerEvent.IndexerDeployed, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('/:id/stop')
  @HttpCode(HttpStatus.OK)
  async stopIndexer(@Request() req, @Param('id') id: string): Promise<void> {
    const indexer = await this.indexerRepo.findOne({
      where: {id},
      attributes: {include: ['id', 'userId', 'status']},
    });
    if (!indexer) {
      throw new MassbitNotFoundException(`Indexer not found`);
    }

    if (indexer.userId !== req.user.userId) {
      throw new MassbitForbiddenException('');
    }

    if (indexer.status !== IndexerStatus.RUNNING) {
      throw new MassbitBadRequestException('Invalid indexer status');
    }

    this.eventEmitter.emit(IndexerEvent.IndexerStopped, id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('/:id')
  @HttpCode(HttpStatus.OK)
  async deleteIndexer(@Request() req, @Param('id') id: string): Promise<void> {
    const indexer = await this.indexerRepo.findOne({
      where: {id},
      attributes: {include: ['id', 'userId', 'status']},
    });
    if (!indexer) {
      throw new MassbitNotFoundException(`Indexer not found`);
    }

    if (indexer.userId !== req.user.userId) {
      throw new MassbitForbiddenException('');
    }

    if (indexer.status !== IndexerStatus.DRAFT) {
      throw new MassbitBadRequestException('Invalid indexer status');
    }

    await this.indexerRepo.destroy({where: {id}});
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getIndexerList(): Promise<IndexerDto[]> {
    const indexers = await this.indexerRepo.findAll({order: [['created_at', 'DESC']]});
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
