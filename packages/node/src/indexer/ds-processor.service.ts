import path from 'path';
import {SubstrateCustomDatasource, SubstrateDatasourceProcessor, SubstrateNetworkFilter} from '@massbit/types';
import {Injectable, Scope} from '@nestjs/common';
import {VMScript} from '@subql/x-vm2';
import {SubIndexProject} from '../configure/project.model';
import {getLogger} from '../utils/logger';
import {isCustomDs} from '../utils/project';
import {Sandbox} from './sandbox.service';

export interface DsPluginSandboxOption {
  root: string;
  entry: string;
}

const logger = getLogger('ds-sandbox');

export class DsPluginSandbox extends Sandbox {
  constructor(option: DsPluginSandboxOption) {
    super(
      option,
      new VMScript(`module.exports = require('${option.entry}').default;`, path.join(option.root, 'ds_sandbox'))
    );
    this.freeze(logger, 'logger');
  }

  getDsPlugin<D extends string, T extends SubstrateNetworkFilter>(): SubstrateDatasourceProcessor<D, T> {
    return this.run(this.script);
  }
}

export class DsProcessorService {
  private processorCache: {
    [entry: string]: SubstrateDatasourceProcessor<string, SubstrateNetworkFilter>;
  } = {};
  private project: SubIndexProject;

  constructor(project: SubIndexProject) {
    this.project = project;
  }

  validateCustomDs(): void {
    for (const ds of this.project.dataSources.filter(isCustomDs)) {
      const processor = this.getDsProcessor(ds);
      /* Standard validation applicable to all custom ds and processors */
      if (ds.kind !== processor.kind) {
        throw new Error('ds kind doesnt match processor');
      }

      for (const handler of ds.mapping.handlers) {
        if (!(handler.kind in processor.handlerProcessors)) {
          throw new Error(`ds kind ${handler.kind} not one of ${Object.keys(processor.handlerProcessors).join(', ')}`);
        }
      }

      /* Additional processor specific validation */
      processor.validate(ds);
    }
  }

  getDsProcessor<D extends string, T extends SubstrateNetworkFilter>(
    ds: SubstrateCustomDatasource<string, T>
  ): SubstrateDatasourceProcessor<D, T> {
    if (!isCustomDs(ds)) {
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
    return this.processorCache[ds.processor.file] as unknown as SubstrateDatasourceProcessor<D, T>;
  }
}
