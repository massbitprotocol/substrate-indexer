import path from 'path';
import {isRuntimeDataSourceV0_0_2, levelFilter, timeout, getProjectEntry, Project} from '@massbit/common';
import {Store, Datasource} from '@massbit/types';
import {ApiPromise} from '@polkadot/api';
import {merge} from 'lodash';
import {NodeVM, NodeVMOptions, VMScript} from 'vm2';
import {Config} from '../configure/config';
import {getLogger} from '../utils/logger';
import {ApiService} from './api.service';
import {StoreService} from './store.service';

export interface SandboxOption {
  store?: Store;
  api?: ApiPromise;
  root: string;
  entry: string;
}

const DEFAULT_OPTION: NodeVMOptions = {
  console: 'redirect',
  wasm: false,
  sandbox: {},
  require: {
    builtin: ['assert', 'buffer', 'crypto', 'util', 'path'],
    external: true,
    context: 'sandbox',
  },
  wrapper: 'commonjs',
  sourceExtensions: ['js', 'cjs'],
};

const logger = getLogger('sandbox');

export class Sandbox extends NodeVM {
  constructor(option: SandboxOption, protected readonly script: VMScript) {
    super(
      merge(DEFAULT_OPTION, {
        require: {
          root: option.root,
          resolve: (moduleName: string) => {
            return require.resolve(moduleName, {paths: [option.root]});
          },
        },
      })
    );
  }

  async runTimeout<T = unknown>(duration: number): Promise<T> {
    return timeout(this.run(this.script), duration);
  }
}

export class IndexerSandbox extends Sandbox {
  constructor(option: SandboxOption, private readonly config: Config) {
    super(
      option,
      new VMScript(
        `
      const mappingFunctions = require('${option.entry}');
      module.exports = mappingFunctions[funcName](...args);
    `,
        path.join(option.root, 'sandbox')
      )
    );
    this.injectGlobals(option);
  }

  async securedExec(funcName: string, args: unknown[]): Promise<void> {
    this.setGlobal('args', args);
    this.setGlobal('funcName', funcName);
    try {
      await this.runTimeout(this.config.timeout);
    } catch (e) {
      e.handler = funcName;
      if (this.config.logLevel && levelFilter('debug', this.config.logLevel)) {
        e.handlerArgs = JSON.stringify(args);
      }
      throw e;
    } finally {
      this.setGlobal('args', []);
      this.setGlobal('funcName', '');
    }
  }

  private injectGlobals({api, store}: SandboxOption) {
    if (store) {
      this.freeze(store, 'store');
    }
    if (api) {
      this.freeze(api, 'api');
    }
    this.freeze(logger, 'logger');
  }
}

export class SandboxService {
  private processorCache: Record<string, IndexerSandbox> = {};
  private apiService: ApiService;
  private storeService: StoreService;
  private project: Project;
  private readonly nodeConfig: Config;

  constructor(project: Project, nodeConfig: Config, apiService: ApiService, storeService: StoreService) {
    this.project = project;
    this.nodeConfig = nodeConfig;
    this.apiService = apiService;
    this.storeService = storeService;
  }

  async getDatasourceProcessor(ds: Datasource): Promise<IndexerSandbox> {
    const entry = this.getDataSourceEntry(ds);

    if (!this.processorCache[entry]) {
      this.processorCache[entry] = new IndexerSandbox(
        {
          api: await this.apiService.getPatchedApi(),
          entry,
          root: this.project.path,
          store: this.storeService.getStore(),
        },
        this.nodeConfig
      );
    }

    return this.processorCache[entry];
  }

  private getDataSourceEntry(ds: Datasource): string {
    if (isRuntimeDataSourceV0_0_2(ds)) {
      return ds.mapping.file;
    } else {
      return getProjectEntry(this.project.path);
    }
  }
}
