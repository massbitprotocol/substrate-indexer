import assert from 'assert';
import path from 'path';
import { assign } from '@massbit/common';
import { last } from 'lodash';
import { LevelWithSilent } from 'pino';

export interface IConfig {
  readonly indexer: string;
  readonly indexerName?: string;
  readonly dbSchema?: string;
  readonly batchSize: number;
  readonly localMode: boolean;
  readonly timeout: number;
  readonly debug: boolean;
  readonly networkEndpoint?: string;
  readonly logLevel?: LevelWithSilent;
  readonly queryLimit: number;
  readonly indexCountLimit: number;
  readonly timestampField: boolean;
}

export type MinConfig = Partial<Omit<IConfig, 'indexer'>> &
  Pick<IConfig, 'indexer'>;

const DEFAULT_CONFIG = {
  localMode: false,
  batchSize: 100,
  timeout: 900,
  preferRange: false,
  debug: false,
  queryLimit: 100,
  indexCountLimit: 10,
  timestampField: true,
};

export class Config implements IConfig {
  private readonly _config: IConfig;

  constructor(config: MinConfig) {
    this._config = assign({}, DEFAULT_CONFIG, config);
  }

  get indexer(): string {
    assert(this._config.indexer);
    return this._config.indexer;
  }

  get indexerName(): string {
    assert(this._config.indexer);
    return this._config.indexerName ?? last(this.indexer.split(path.sep));
  }

  get localMode(): boolean {
    return this._config.localMode;
  }

  get batchSize(): number {
    return this._config.batchSize;
  }

  get networkEndpoint(): string | undefined {
    return this._config.networkEndpoint;
  }

  get timeout(): number {
    return this._config.timeout;
  }

  get debug(): boolean {
    return this._config.debug;
  }

  get logLevel(): LevelWithSilent {
    return this.debug ? 'debug' : this._config.logLevel;
  }

  get queryLimit(): number {
    return this._config.queryLimit;
  }

  get indexCountLimit(): number {
    return this._config.indexCountLimit;
  }

  get timestampField(): boolean {
    return this._config.timestampField;
  }

  get dbSchema(): string {
    return this._config.dbSchema ?? this.indexerName;
  }

  merge(config: Partial<IConfig>): this {
    assign(this._config, config);
    return this;
  }
}
