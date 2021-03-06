import {ApiPromise} from '@polkadot/api';
import Pino from 'pino';
import {Store} from './interfaces';

declare global {
  const api: ApiPromise;
  const logger: Pino.Logger;
  const store: Store;
}
