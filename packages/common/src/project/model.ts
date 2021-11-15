import path from 'path';
import {Datasource} from '@massbit/types';
import {RegisteredTypes} from '@polkadot/types/types';
import {pick} from 'lodash';
import {
  INetworkConfig,
  loadFromJsonOrYaml,
  loadProjectManifest,
  manifestIsV0_0_1,
  manifestIsV0_0_2,
  VersionedManifest,
  parseChainTypes,
} from '../manifest';
import {prepareProjectDir} from '../utils';

export class Project {
  private readonly _path: string;
  private readonly _manifest: VersionedManifest;

  static async create(path: string, networkOverrides?: Partial<INetworkConfig>): Promise<Project> {
    const projectPath = await prepareProjectDir(path);
    const projectManifest = loadProjectManifest(projectPath);
    return new Project(projectManifest, projectPath, networkOverrides);
  }

  constructor(manifest: VersionedManifest, path: string, private networkOverrides?: Partial<INetworkConfig>) {
    this._manifest = manifest;
    this._path = path;

    manifest.dataSources?.forEach(function (dataSource) {
      if (!dataSource.startBlock || dataSource.startBlock < 1) {
        dataSource.startBlock = 1;
      }
    });
  }

  get manifest(): VersionedManifest {
    return this._manifest;
  }

  get network(): Partial<INetworkConfig> {
    const impl = this._manifest.asImpl;

    if (manifestIsV0_0_1(impl)) {
      return {
        ...impl.network,
        ...this.networkOverrides,
      };
    }

    if (manifestIsV0_0_2(impl)) {
      const network = {
        ...impl.network,
        ...this.networkOverrides,
      };
      if (!network.endpoint) {
        throw new Error(`Network endpoint must be provided for network. genesisHash="${network.genesisHash}"`);
      }
      return network;
    }

    throw new Error(`unsupported specVersion: ${this._manifest.specVersion}`);
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
    if (manifestIsV0_0_1(impl)) {
      return pick<RegisteredTypes>(impl.network, ['types', 'typesAlias', 'typesBundle', 'typesChain', 'typesSpec']);
    }

    if (manifestIsV0_0_2(impl)) {
      if (!impl.network.chainType) {
        return;
      }
      const rawChainTypes = loadFromJsonOrYaml(path.join(this._path, impl.network.chainType.file));
      return parseChainTypes(rawChainTypes);
    }
  }
}
