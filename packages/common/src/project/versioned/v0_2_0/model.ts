import {
  SubstrateCustomDatasource,
  SubstrateCustomHandler,
  SubstrateMapping,
  SubstrateNetworkFilter,
  SubstrateRuntimeHandler,
} from '@massbit/types';
import {Type} from 'class-transformer';
import {Equals, IsArray, IsObject, IsOptional, IsString, ValidateNested} from 'class-validator';
import {CustomDataSourceBase, Mapping, RuntimeDataSourceBase} from '../../models';
import {ProjectManifestBaseImpl} from '../base';
import {ProjectManifestV0_2_0, RuntimeDataSourceV0_2_0, SubstrateMappingV0_2_0} from './types';

export class FileType {
  @IsString()
  file: string;
}

export class ProjectNetworkV0_2_0 {
  @IsString()
  genesisHash: string;
  @IsString()
  @IsOptional()
  endpoint: string;
  @IsObject()
  @ValidateNested()
  @Type(() => FileType)
  @IsOptional()
  chaintypes: FileType;
}

export class ProjectMappingV0_2_0 extends Mapping {
  @IsString()
  file: string;
}

export class RuntimeDataSourceV0_2_0Impl
  extends RuntimeDataSourceBase<SubstrateMappingV0_2_0<SubstrateRuntimeHandler>>
  implements RuntimeDataSourceV0_2_0
{
  @Type(() => ProjectMappingV0_2_0)
  @ValidateNested()
  mapping: SubstrateMappingV0_2_0<SubstrateRuntimeHandler>;
}

export class CustomDataSourceV0_2_0Impl<
    K extends string = string,
    T extends SubstrateNetworkFilter = SubstrateNetworkFilter,
    M extends SubstrateMapping = SubstrateMapping<SubstrateCustomHandler>
  >
  extends CustomDataSourceBase<K, T, M>
  implements SubstrateCustomDatasource<K, T, M> {}

export class ProjectManifestV0_2_0Impl extends ProjectManifestBaseImpl implements ProjectManifestV0_2_0 {
  @Equals('0.2.0')
  specVersion: string;
  @IsString()
  name: string;
  @IsString()
  version: string;
  @IsObject()
  @ValidateNested()
  @Type(() => ProjectNetworkV0_2_0)
  network: ProjectNetworkV0_2_0;
  @ValidateNested()
  @Type(() => FileType)
  schema: FileType;
  @IsArray()
  @ValidateNested()
  @Type(() => CustomDataSourceV0_2_0Impl, {
    discriminator: {
      property: 'kind',
      subTypes: [{value: RuntimeDataSourceV0_2_0Impl, name: 'substrate/Runtime'}],
    },
    keepDiscriminatorProperty: true,
  })
  dataSources: (RuntimeDataSourceV0_2_0 | SubstrateCustomDatasource)[];
}
