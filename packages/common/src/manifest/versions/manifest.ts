import {Datasource} from '@massbit/types';
import {plainToClass} from 'class-transformer';
import {IManifest} from '../types';
import {ManifestV0_0_1} from './v0_0_1';

export type ManifestVersioned = {specVersion: string};

const SUPPORTED_VERSIONS = {
  '0.0.1': ManifestV0_0_1,
};

type Versions = keyof typeof SUPPORTED_VERSIONS;

type Manifest = InstanceType<typeof SUPPORTED_VERSIONS[Versions]>;

export function isManifestV0_0_1(manifest: IManifest): manifest is ManifestV0_0_1 {
  return manifest.specVersion === '0.0.1';
}

export class VersionedManifest implements IManifest {
  private readonly _manifest: Manifest;

  constructor(manifest: ManifestVersioned) {
    const klass = SUPPORTED_VERSIONS[manifest.specVersion as Versions];
    if (!klass) {
      throw new Error('specVersion not supported for this manifest');
    }
    this._manifest = plainToClass<Manifest, ManifestVersioned>(klass, manifest);
  }

  get asImpl(): IManifest {
    return this._manifest;
  }

  get isV0_0_1(): boolean {
    return this.specVersion === '0.0.1';
  }

  validate(): void {
    this._manifest.validate();
  }

  get name(): string {
    return this._manifest.name;
  }

  get dataSources(): Datasource[] {
    return this._manifest.dataSources;
  }

  get schema(): string {
    return this._manifest.schema;
  }

  get specVersion(): string {
    return this._manifest.specVersion;
  }

  get description(): string {
    return this._manifest.description;
  }

  get repository(): string {
    return this._manifest.repository;
  }
}