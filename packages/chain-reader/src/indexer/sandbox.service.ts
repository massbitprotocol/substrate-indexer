import path from 'path';
import {
  isRuntimeDataSourceV0_0_2,
  levelFilter,
  Project,
  timeout,
  getProjectEntry,
} from '@massbit/common';
import { Store, Datasource } from '@massbit/types';
import { Injectable } from '@nestjs/common';
import { merge } from 'lodash';
import { NodeVM, NodeVMOptions, VMScript } from 'vm2';
import { Config } from '../configure/config';
import { getLogger } from '../utils/logger';
import { ApiService } from './api.service';
import { StoreService } from './store.service';
import { ApiAt } from './types';

export interface SandboxOption {
  store?: Store;
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
            return require.resolve(moduleName, { paths: [option.root] });
          },
        },
      }),
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
        path.join(option.root, 'sandbox'),
      ),
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

  private injectGlobals({ store }: SandboxOption) {
    if (store) {
      this.freeze(store, 'store');
    }
    this.freeze(logger, 'logger');
  }
}

@Injectable()
export class SandboxService {
  private processorCache: Record<string, IndexerSandbox> = {};

  constructor(
    private readonly apiService: ApiService,
    private readonly storeService: StoreService,
    private readonly config: Config,
    private readonly project: Project,
  ) {}

  getDatasourceProcessor(ds: Datasource, api: ApiAt): IndexerSandbox {
    const entry = this.getDataSourceEntry(ds);
    let processor = this.processorCache[entry];
    if (!processor) {
      processor = new IndexerSandbox(
        {
          entry,
          root: this.project.path,
          store: this.storeService.getStore(),
        },
        this.config,
      );
      this.processorCache[entry] = processor;
    }
    processor.freeze(api, 'api');
    return processor;
  }

  private getDataSourceEntry(ds: Datasource): string {
    if (isRuntimeDataSourceV0_0_2(ds)) {
      return ds.mapping.file;
    } else {
      return getProjectEntry(this.project.path);
    }
  }
}
