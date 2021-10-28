import {SubstrateBlock, SubstrateEvent, SubstrateExtrinsic} from '@massbit/types';
import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {Event, Extrinsic, SpecVersion} from '../entities';
import {getLogger} from '../utils/logger';
import {ApiService} from './api.service';
import {FetchService} from './fetch.service';
import {BlockContent} from './types';

const logger = getLogger('chain-reader');

@Injectable()
export class ChainReader {
  constructor(
    @InjectRepository(SpecVersion)
    private readonly specVersionRepository: Repository<SpecVersion>,
    @InjectRepository(Extrinsic)
    private readonly extrinsicRepository: Repository<Extrinsic>,
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    private apiService: ApiService,
    private fetchService: FetchService
  ) {}

  async indexBlock(blockContent: BlockContent): Promise<void> {
    const {block, events, extrinsics} = blockContent;
    await this.handleBlock(block);
    await this.handleEvents(events);
    await this.handleExtrinsics(extrinsics);
  }

  async start(): Promise<void> {
    await this.apiService.init();
    await this.fetchService.init();

    void this.fetchService.startLoop(1).catch((err) => {
      logger.error(err, 'failed to fetch block');
      // TODO: retry before exit
      process.exit(1);
    });

    this.fetchService.register((block) => this.indexBlock(block));
  }

  async handleBlock(block: SubstrateBlock): Promise<void> {
    await this.specVersionRepository.save(
      new SpecVersion({
        id: block.specVersion.toString(),
        blockHeight: block.block.header.number.toNumber(),
      })
    );
  }

  async handleEvents(events: SubstrateEvent[]): Promise<void> {
    await this.eventRepository.save(
      events.map(
        (event) =>
          new Event({
            id: `${event.block.block.header.number}-${event.idx.toString()}`,
            blockHeight: event.block.block.header.number.toNumber(),
            module: event.event.section,
            event: event.event.method,
          })
      )
    );
  }

  async handleExtrinsics(extrinsics: SubstrateExtrinsic[]): Promise<void> {
    await this.extrinsicRepository.save(
      extrinsics.map(
        (extrinsic) =>
          new Extrinsic({
            id: extrinsic.extrinsic.hash.toString(),
            module: extrinsic.extrinsic.method.section,
            call: extrinsic.extrinsic.method.method,
            blockHeight: extrinsic.block.block.header.number.toNumber(),
            success: extrinsic.success,
            isSigned: extrinsic.extrinsic.isSigned,
          })
      )
    );
  }
}
