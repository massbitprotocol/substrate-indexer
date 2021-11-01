import {SubstrateBlock, SubstrateEvent, SubstrateExtrinsic} from '@massbit/types';
import {Injectable} from '@nestjs/common';
import {Connection, EntityManager, getConnection} from 'typeorm';
import {NodeConfig} from '../configure/node-config';
import {Event, Extrinsic, SpecVersion} from '../entities';
import {getLogger} from '../utils/logger';
import {ApiService} from './api.service';
import {FetchService} from './fetch.service';
import {BlockContent} from './types';

const logger = getLogger('chain-reader');

@Injectable()
export class ChainReader {
  constructor(
    private connection: Connection,
    private apiService: ApiService,
    private fetchService: FetchService,
    private nodeConfig: NodeConfig
  ) {}

  async indexBlock(blockContent: BlockContent): Promise<void> {
    const {block, events, extrinsics} = blockContent;
    await getConnection().transaction(async (entityManager) => {
      await Promise.all([
        this.handleBlock(entityManager, block),
        this.handleEvents(entityManager, events),
        this.handleExtrinsics(entityManager, extrinsics),
      ]);
    });
  }

  async start(): Promise<void> {
    await this.apiService.init();
    await this.fetchService.init();

    void this.fetchService.startLoop(this.nodeConfig.startBlock || 1).catch((err) => {
      logger.error(err, 'failed to fetch block');
      // TODO: retry before exit
      process.exit(1);
    });

    this.fetchService.register((block) => this.indexBlock(block));
  }

  async handleBlock(entityManager: EntityManager, block: SubstrateBlock): Promise<void> {
    const specVersion = await entityManager.findOne(SpecVersion, {id: block.specVersion.toString()});
    if (!specVersion) {
      await entityManager.save(
        new SpecVersion({
          id: block.specVersion.toString(),
          blockHeight: block.block.header.number.toNumber(),
        })
      );
    }
  }

  async handleEvents(entityManager: EntityManager, events: SubstrateEvent[]): Promise<void> {
    await entityManager.save(
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

  async handleExtrinsics(entityManager: EntityManager, extrinsics: SubstrateExtrinsic[]): Promise<void> {
    await entityManager.save(
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
