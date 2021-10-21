import path from 'path';
import {
  loadProjectManifest,
  parseChainTypes,
  ProjectNetworkConfig,
  ProjectManifestVersioned,
  manifestIsV0_0_1,
  manifestIsV0_2_0,
  loadFromJsonOrYaml,
} from '@massbit/common';
import {SubstrateDatasource} from '@massbit/types';
import {RegisteredTypes} from '@polkadot/types/types';
import {pick} from 'lodash';
import {getLogger} from '../utils/logger';
import {prepareProjectDir} from '../utils/project';

const logger = getLogger('configure');

export class SubIndexProject {
  private readonly _path: string;
  private readonly _projectManifest: ProjectManifestVersioned;

  static async create(path: string, networkOverrides?: Partial<ProjectNetworkConfig>): Promise<SubIndexProject> {
    const projectPath = await prepareProjectDir(path);
    const projectManifest = loadProjectManifest(projectPath);
    return new SubIndexProject(projectManifest, projectPath, networkOverrides);
  }

  constructor(
    manifest: ProjectManifestVersioned,
    path: string,
    private networkOverrides?: Partial<ProjectNetworkConfig>
  ) {
    this._projectManifest = manifest;
    this._path = path;

    manifest.dataSources?.forEach(function (dataSource) {
      if (!dataSource.startBlock || dataSource.startBlock < 1) {
        if (dataSource.startBlock < 1) logger.warn('start block changed to #1');
        dataSource.startBlock = 1;
      }
    });
  }

  get projectManifest(): ProjectManifestVersioned {
    return this._projectManifest;
  }

  get network(): Partial<ProjectNetworkConfig> {
    const impl = this._projectManifest.asImpl;

    if (manifestIsV0_0_1(impl)) {
      return {
        ...impl.network,
        ...this.networkOverrides,
      };
    }

    if (manifestIsV0_2_0(impl)) {
      const network = {
        ...impl.network,
        ...this.networkOverrides,
      };

      if (!network.endpoint) {
        throw new Error(`Network endpoint must be provided for network. genesisHash="${network.genesisHash}"`);
      }

      return network;
    }

    throw new Error(`unsupported specVersion: ${this._projectManifest.specVersion}`);
  }

  get path(): string {
    return this._path;
  }
  get dataSources(): SubstrateDatasource[] {
    return this._projectManifest.dataSources;
  }
  get schema(): string {
    return this._projectManifest.schema;
  }

  get chainTypes(): RegisteredTypes | undefined {
    const impl = this._projectManifest.asImpl;
    if (manifestIsV0_0_1(impl)) {
      return pick<RegisteredTypes>(impl.network, ['types', 'typesAlias', 'typesBundle', 'typesChain', 'typesSpec']);
    }

    if (manifestIsV0_2_0(impl)) {
      if (!impl.network.chaintypes) {
        return;
      }

      const rawChainTypes = loadFromJsonOrYaml(path.join(this._path, impl.network.chaintypes.file));

      return parseChainTypes(rawChainTypes);
    }
  }
}
