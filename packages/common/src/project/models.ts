import {
  CustomDataSourceAsset,
  FileReference,
  SubstrateBlockFilter,
  SubstrateCallFilter,
  SubstrateCustomDatasource,
  SubstrateCustomHandler,
  SubstrateDatasourceKind,
  SubstrateEventFilter,
  SubstrateHandler,
  SubstrateHandlerKind,
  SubstrateMapping,
  SubstrateNetworkFilter,
  SubstrateRuntimeDatasource,
  SubstrateRuntimeHandler,
} from '@massbit/types';
import {RegisteredTypes, RegistryTypes, OverrideModuleType, OverrideBundleType} from '@polkadot/types/types';
import {plainToClass, Transform, Type} from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsObject,
  ValidateNested,
} from 'class-validator';

export class BlockFilter implements SubstrateBlockFilter {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  specVersion?: [number, number];
}

export class EventFilter extends BlockFilter implements SubstrateEventFilter {
  @IsOptional()
  @IsString()
  module?: string;
  @IsOptional()
  @IsString()
  method?: string;
}

export class ChainTypes implements RegisteredTypes {
  @IsObject()
  @IsOptional()
  types?: RegistryTypes;
  @IsObject()
  @IsOptional()
  typesAlias?: Record<string, OverrideModuleType>;
  @IsObject()
  @IsOptional()
  typesBundle?: OverrideBundleType;
  @IsObject()
  @IsOptional()
  typesChain?: Record<string, RegistryTypes>;
  @IsObject()
  @IsOptional()
  typesSpec?: Record<string, RegistryTypes>;
}

export class CallFilter extends EventFilter implements SubstrateCallFilter {
  @IsOptional()
  @IsBoolean()
  success?: boolean;
}

export class BlockHandler {
  @IsOptional()
  @ValidateNested()
  @Type(() => BlockFilter)
  filter?: SubstrateBlockFilter;
  @IsEnum(SubstrateHandlerKind, {groups: [SubstrateHandlerKind.Block]})
  kind: SubstrateHandlerKind.Block;
  @IsString()
  handler: string;
}

export class CallHandler {
  @IsOptional()
  @ValidateNested()
  @Type(() => CallFilter)
  filter?: SubstrateCallFilter;
  @IsEnum(SubstrateHandlerKind, {groups: [SubstrateHandlerKind.Call]})
  kind: SubstrateHandlerKind.Call;
  @IsString()
  handler: string;
}

export class EventHandler {
  @IsOptional()
  @ValidateNested()
  @Type(() => EventFilter)
  filter?: SubstrateEventFilter;
  @IsEnum(SubstrateHandlerKind, {groups: [SubstrateHandlerKind.Event]})
  kind: SubstrateHandlerKind.Event;
  @IsString()
  handler: string;
}

export class CustomHandler implements SubstrateCustomHandler {
  @IsString()
  kind: string;
  @IsString()
  handler: string;
  @IsObject()
  @IsOptional()
  filter?: Record<string, unknown>;
}

export class Mapping implements SubstrateMapping {
  @Transform((handlers: SubstrateHandler[]) => {
    return handlers.map((handler) => {
      switch (handler.kind) {
        case SubstrateHandlerKind.Event:
          return plainToClass(EventHandler, handler);
        case SubstrateHandlerKind.Call:
          return plainToClass(CallHandler, handler);
        case SubstrateHandlerKind.Block:
          return plainToClass(BlockHandler, handler);
        default:
          throw new Error(`handler ${(handler as any).kind} not supported`);
      }
    });
  })
  @IsArray()
  @ValidateNested()
  handlers: SubstrateHandler[];
}

export class CustomMapping implements SubstrateMapping<SubstrateCustomHandler> {
  @IsArray()
  @Type(() => CustomHandler)
  @ValidateNested()
  handlers: CustomHandler[];
  @IsString()
  file: string;
}

export class SubstrateNetworkFilterImpl implements SubstrateNetworkFilter {
  @IsString()
  @IsOptional()
  specName?: string;
}

export class RuntimeDataSourceBase<M extends SubstrateMapping<SubstrateRuntimeHandler>>
  implements SubstrateRuntimeDatasource<M>
{
  @IsEnum(SubstrateDatasourceKind, {groups: [SubstrateDatasourceKind.Runtime]})
  kind: SubstrateDatasourceKind.Runtime;
  @Type(() => Mapping)
  @ValidateNested()
  mapping: M;
  @IsOptional()
  @IsInt()
  startBlock?: number;
  @IsOptional()
  @ValidateNested()
  @Type(() => SubstrateNetworkFilterImpl)
  filter?: SubstrateNetworkFilter;
}

export class FileReferenceImpl implements FileReference {
  @IsString()
  file: string;
}

export class CustomDataSourceBase<
  K extends string,
  T extends SubstrateNetworkFilter,
  M extends SubstrateMapping = SubstrateMapping<SubstrateCustomHandler>
> implements SubstrateCustomDatasource<K, T, M>
{
  @IsString()
  kind: K;
  @Type(() => CustomMapping)
  @ValidateNested()
  mapping: M;
  @IsOptional()
  @IsInt()
  startBlock?: number;
  @Type(() => FileReferenceImpl)
  @ValidateNested({each: true})
  assets: {[p: string]: CustomDataSourceAsset};
  @Type(() => FileReferenceImpl)
  @IsObject()
  processor: FileReference;
  @IsOptional()
  @IsObject()
  filter?: T;
}
