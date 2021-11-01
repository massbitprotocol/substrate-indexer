import {Injectable, OnApplicationShutdown} from '@nestjs/common';
import {ApiPromise, HttpProvider, WsProvider} from '@polkadot/api';
import {ApiOptions} from '@polkadot/api/types';
import {NodeConfig} from '../configure/node-config';
import {NetworkMetadataPayload} from './events';

@Injectable()
export class ApiService implements OnApplicationShutdown {
  private api: ApiPromise;
  private apiOption: ApiOptions;
  networkMeta: NetworkMetadataPayload;

  constructor(private config: NodeConfig) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.api?.disconnect()]);
  }

  async init(): Promise<ApiService> {
    let provider: WsProvider | HttpProvider;
    let throwOnConnect = false;
    const {networkEndpoint} = this.config;
    if (networkEndpoint.startsWith('ws')) {
      provider = new WsProvider(networkEndpoint);
    } else if (networkEndpoint.startsWith('http')) {
      provider = new HttpProvider(networkEndpoint);
      throwOnConnect = true;
    }
    this.apiOption = {
      provider,
      throwOnConnect,
    };
    this.api = await ApiPromise.create(this.apiOption);
    this.networkMeta = {
      chain: this.api.runtimeChain.toString(),
      specName: this.api.runtimeVersion.specName.toString(),
      genesisHash: this.api.genesisHash.toString(),
      blockTime:
        this.api.consts.babe?.expectedBlockTime.toNumber() ||
        this.api.consts.timestamp?.minimumPeriod.muln(2).toNumber() ||
        6000,
    };
    return this;
  }

  getApi(): ApiPromise {
    return this.api;
  }
}
