import {assign} from '@massbit/common';
import {LevelWithSilent} from 'pino';

export interface IConfig {
  readonly batchSize: number;
  readonly timeout: number;
  readonly debug: boolean;
  readonly preferRange: boolean;
  readonly networkEndpoint?: string;
  readonly networkIndexer?: string;
  readonly outputFmt?: 'json';
  readonly logLevel?: LevelWithSilent;
  readonly queryLimit: number;
  readonly indexCountLimit: number;
  readonly timestampField: boolean;
}

const DEFAULT_CONFIG = {
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

  constructor(config: IConfig) {
    this._config = assign({}, DEFAULT_CONFIG, config);
  }

  get batchSize(): number {
    return this._config.batchSize;
  }

  get networkEndpoint(): string | undefined {
    return this._config.networkEndpoint;
  }

  get networkIndexer(): string | undefined {
    return this._config.networkIndexer;
  }

  get timeout(): number {
    return this._config.timeout;
  }

  get debug(): boolean {
    return this._config.debug;
  }
  get preferRange(): boolean {
    return this._config.preferRange;
  }

  get outputFmt(): 'json' | undefined {
    return this._config.outputFmt;
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

  merge(config: Partial<IConfig>): this {
    assign(this._config, config);
    return this;
  }
}
