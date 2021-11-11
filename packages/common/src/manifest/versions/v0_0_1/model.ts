import {SubstrateMapping, SubstrateRuntimeHandler} from '@massbit/types';
import {Type} from 'class-transformer';
import {Equals, IsArray, IsObject, IsOptional, IsString, ValidateNested} from 'class-validator';
import {RuntimeDataSourceBase, ChainTypes} from '../../models';
import {INetworkConfig} from '../../types';
import {BaseManifest} from '../base';
import {IManifestV0_0_1, IRuntimeDataSourceV0_0_1} from './types';

export class IndexerNetworkV0_0_1 extends ChainTypes implements INetworkConfig {
  @IsString()
  endpoint: string;
  @IsString()
  @IsOptional()
  networkIndexer?: string;
}

export class RuntimeDataSourceV0_0_1
  extends RuntimeDataSourceBase<SubstrateMapping<SubstrateRuntimeHandler>>
  implements IRuntimeDataSourceV0_0_1
{
  @IsString()
  name: string;
}

export class ManifestV0_0_1 extends BaseManifest implements IManifestV0_0_1 {
  @Equals('0.0.1')
  specVersion: string;
  @ValidateNested()
  @Type(() => IndexerNetworkV0_0_1)
  @IsObject()
  network: IndexerNetworkV0_0_1;
  @IsString()
  schema: string;
  @IsArray()
  @ValidateNested()
  @Type(() => RuntimeDataSourceV0_0_1)
  dataSources: IRuntimeDataSourceV0_0_1[];
}
