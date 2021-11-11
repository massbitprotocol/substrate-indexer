import path from 'path';
import { isCustomDatasource, Project } from '@massbit/common';
import {
  SubstrateCustomDatasource,
  SubstrateDatasourceProcessor,
  SubstrateNetworkFilter,
} from '@massbit/types';
import { Injectable } from '@nestjs/common';
import { VMScript } from 'vm2';
import { getLogger } from '../utils/logger';
import { Sandbox } from './sandbox.service';

export interface DsPluginSandboxOption {
  root: string;
  entry: string;
}

const logger = getLogger('ds-sandbox');

export class DsPluginSandbox extends Sandbox {
  constructor(option: DsPluginSandboxOption) {
    super(
      option,
      new VMScript(
        `module.exports = require('${option.entry}').default;`,
        path.join(option.root, 'ds_sandbox'),
      ),
    );
    this.freeze(logger, 'logger');
  }

  getDsPlugin<
    D extends string,
    T extends SubstrateNetworkFilter,
  >(): SubstrateDatasourceProcessor<D, T> {
    return this.run(this.script);
  }
}

@Injectable()
export class DsProcessorService {
  private processorCache: {
    [entry: string]: SubstrateDatasourceProcessor<
      string,
      SubstrateNetworkFilter
    >;
  } = {};
  constructor(private project: Project) {}

  getDsProcessor<D extends string, T extends SubstrateNetworkFilter>(
    ds: SubstrateCustomDatasource<string, T>,
  ): SubstrateDatasourceProcessor<D, T> {
    if (!isCustomDatasource(ds)) {
      throw new Error(`data source is not a custom data source`);
    }

    if (!this.processorCache[ds.processor.file]) {
      const sandbox = new DsPluginSandbox({
        root: this.project.path,
        entry: ds.processor.file,
      });
      try {
        this.processorCache[ds.processor.file] = sandbox.getDsPlugin<D, T>();
      } catch (e) {
        logger.error(`not supported ds @${ds.kind}`);
        throw e;
      }
    }
    return this.processorCache[
      ds.processor.file
    ] as unknown as SubstrateDatasourceProcessor<D, T>;
  }
}
