import {Module} from '@nestjs/common';
import {TypeOrmModule} from '@nestjs/typeorm';
import {Event, Extrinsic, SpecVersion} from '../entities';
import {ApiService} from './api.service';
import {ChainReader} from './chain-reader.service';
import {FetchService} from './fetch.service';

@Module({
  imports: [TypeOrmModule.forFeature([SpecVersion, Extrinsic, Event])],
  providers: [ApiService, FetchService, ChainReader],
})
export class ChainReaderModule {}
