import {Datasource} from '@massbit/types';
import {plainToClass} from 'class-transformer';
import {validateSync} from 'class-validator';
import {IManifest} from '../types';
import {ManifestV0_0_1} from './v0_0_1';
import {ManifestV0_0_2} from './v0_0_2';

export type ManifestVersioned = {specVersion: string};

const SUPPORTED_VERSIONS = {
  '0.0.1': ManifestV0_0_1,
  '0.0.2': ManifestV0_0_2,
};

type Versions = keyof typeof SUPPORTED_VERSIONS;

type Manifest = InstanceType<typeof SUPPORTED_VERSIONS[Versions]>;

export function manifestIsV0_0_1(manifest: IManifest): manifest is ManifestV0_0_1 {
  return manifest.specVersion === '0.0.1';
}

export function manifestIsV0_0_2(manifest: IManifest): manifest is ManifestV0_0_2 {
  return manifest.specVersion === '0.0.2';
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

  validate(): void {
    const errors = validateSync(this._manifest, {whitelist: true, forbidNonWhitelisted: true});
    if (errors?.length) {
      const errorMessages = errors.map((e) => e.toString()).join('\n');
      throw new Error(`failed to parse project.yaml.\n${errorMessages}`);
    }
  }

  get name(): string {
    return this._manifest.name;
  }

  get dataSources(): Datasource[] {
    return this._manifest.dataSources;
  }

  get schema(): string {
    if (manifestIsV0_0_1(this._manifest)) {
      return this._manifest.schema;
    }
    return this._manifest.schema.file;
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
