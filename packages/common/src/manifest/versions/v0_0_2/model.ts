import {
  SubstrateCustomDatasource,
  SubstrateCustomHandler,
  SubstrateMapping,
  SubstrateNetworkFilter,
  SubstrateRuntimeHandler,
} from '@massbit/types';
import {Type} from 'class-transformer';
import {Equals, IsArray, IsObject, IsOptional, IsString, ValidateNested} from 'class-validator';
import {CustomDataSourceBase, Mapping, RuntimeDataSource} from '../../models';
import {BaseManifest} from '../base';
import {IManifestV0_0_2, IRuntimeDataSourceV0_0_2, SubstrateMappingV0_0_2} from './types';

export class FileType {
  @IsString()
  file: string;
}

export class IndexerNetworkV0_0_2 {
  @IsString()
  genesisHash: string;
  @IsString()
  @IsOptional()
  endpoint: string;
  @IsObject()
  @ValidateNested()
  @Type(() => FileType)
  @IsOptional()
  chainType: FileType;
}

export class IndexerMappingV0_0_2 extends Mapping {
  @IsString()
  file: string;
}

export class RuntimeDataSourceV0_0_2
  extends RuntimeDataSource<SubstrateMappingV0_0_2<SubstrateRuntimeHandler>>
  implements IRuntimeDataSourceV0_0_2
{
  @Type(() => IndexerMappingV0_0_2)
  @ValidateNested()
  mapping: SubstrateMappingV0_0_2<SubstrateRuntimeHandler>;
}

export class CustomDataSourceV0_0_2<
    K extends string = string,
    T extends SubstrateNetworkFilter = SubstrateNetworkFilter,
    M extends SubstrateMapping = SubstrateMapping<SubstrateCustomHandler>
  >
  extends CustomDataSourceBase<K, T, M>
  implements SubstrateCustomDatasource<K, T, M> {}

export class ManifestV0_0_2 extends BaseManifest implements IManifestV0_0_2 {
  @Equals('0.0.2')
  specVersion: string;
  @IsString()
  name: string;
  @IsString()
  version: string;
  @IsObject()
  @ValidateNested()
  @Type(() => IndexerNetworkV0_0_2)
  network: IndexerNetworkV0_0_2;
  @ValidateNested()
  @Type(() => FileType)
  schema: FileType;
  @IsArray()
  @ValidateNested()
  @Type(() => CustomDataSourceV0_0_2, {
    discriminator: {
      property: 'kind',
      subTypes: [{value: RuntimeDataSourceV0_0_2, name: 'substrate/Runtime'}],
    },
    keepDiscriminatorProperty: true,
  })
  dataSources: (IRuntimeDataSourceV0_0_2 | SubstrateCustomDatasource)[];
}
