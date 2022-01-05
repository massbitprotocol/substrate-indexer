import {Datasource} from '@massbit/types';
import {plainToClass} from 'class-transformer';
import {IManifest} from '../types';
import {ManifestV0_0_1} from './v0_0_1';

export type VersionedManifest = {specVersion: string};

const SUPPORTED_VERSIONS = {
  '0.0.1': ManifestV0_0_1,
};

type Versions = keyof typeof SUPPORTED_VERSIONS;

type ManifestImpls = InstanceType<typeof SUPPORTED_VERSIONS[Versions]>;

export class Manifest implements IManifest {
  private readonly _impl: ManifestImpls;

  constructor(manifest: VersionedManifest) {
    const klass = SUPPORTED_VERSIONS[manifest.specVersion as Versions];
    if (!klass) {
      throw new Error("Manifest's specVersion is not supported");
    }
    this._impl = plainToClass<ManifestImpls, VersionedManifest>(klass, manifest);
  }

  get asImpl(): ManifestImpls {
    return this._impl;
  }

  validate(): void {
    this._impl.validate();
  }

  get name(): string {
    return this._impl.name;
  }

  get dataSources(): Datasource[] {
    return this._impl.dataSources;
  }

  get schema(): string {
    return this._impl.schema;
  }

  get specVersion(): string {
    return this._impl.specVersion;
  }

  get description(): string {
    return this._impl.description;
  }

  get repository(): string {
    return this._impl.repository;
  }
}
