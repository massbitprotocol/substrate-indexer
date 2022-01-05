import {Datasource} from '@massbit/types';
import {RegisteredTypes} from '@polkadot/types/types';
import {pick} from 'lodash';
import {INetworkConfig, loadProjectManifest, Manifest} from '../manifest';
import {prepareProjectDir} from '../utils';

export class Project {
  private readonly _path: string;
  private readonly _manifest: Manifest;

  static async create(path: string, networkOverrides?: Partial<INetworkConfig>): Promise<Project> {
    const projectPath = await prepareProjectDir(path);
    const projectManifest = loadProjectManifest(projectPath);
    return new Project(projectManifest, projectPath, networkOverrides);
  }

  constructor(manifest: Manifest, path: string, private networkOverrides?: Partial<INetworkConfig>) {
    this._manifest = manifest;
    this._path = path;

    manifest.dataSources?.forEach(function (dataSource) {
      if (!dataSource.startBlock || dataSource.startBlock < 1) {
        dataSource.startBlock = 1;
      }
    });
  }

  get manifest(): Manifest {
    return this._manifest;
  }

  get network(): Partial<INetworkConfig> {
    const impl = this._manifest.asImpl;
    return {
      ...impl.network,
      ...this.networkOverrides,
    };
  }

  get path(): string {
    return this._path;
  }

  get dataSources(): Datasource[] {
    return this._manifest.dataSources;
  }

  get schema(): string {
    return this._manifest.schema;
  }

  get name(): string {
    return this._manifest.name;
  }

  get chainTypes(): RegisteredTypes | undefined {
    const impl = this._manifest.asImpl;
    return pick<RegisteredTypes>(impl.network, ['types', 'typesAlias', 'typesBundle', 'typesChain', 'typesSpec']);
  }
}
