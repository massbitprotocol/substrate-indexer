import {Project} from '@massbit/common';
import {OnApplicationShutdown} from '@nestjs/common';
import {ApiPromise, HttpProvider, WsProvider} from '@polkadot/api';
import {RpcMethodResult} from '@polkadot/api/types';
import {BlockHash, RuntimeVersion} from '@polkadot/types/interfaces';
import {AnyFunction} from '@polkadot/types/types';
import {ApiAt, NetworkMetadata} from './types';

const NOT_SUPPORT = (name: string) => () => {
  throw new Error(`${name}() is not supported`);
};

export class ApiService implements OnApplicationShutdown {
  private readonly project: Project;

  networkMeta: NetworkMetadata;
  private api: ApiPromise;
  private currentBlockHash: string;
  private currentRuntimeVersion: RuntimeVersion;

  constructor(project: Project) {
    this.project = project;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.api?.disconnect();
  }

  async init(): Promise<ApiService> {
    const {chainTypes, network} = this.project;
    let provider: WsProvider | HttpProvider;
    let throwOnConnect = false;
    if (network.endpoint.startsWith('ws')) {
      provider = new WsProvider(network.endpoint);
    } else if (network.endpoint.startsWith('http')) {
      provider = new HttpProvider(network.endpoint);
      throwOnConnect = true;
    }

    this.api = await ApiPromise.create({
      provider,
      throwOnConnect,
      ...chainTypes,
    });

    this.networkMeta = {
      chain: this.api.runtimeChain.toString(),
      specName: this.api.runtimeVersion.specName.toString(),
      genesisHash: this.api.genesisHash.toString(),
    };

    if (network.genesisHash && network.genesisHash !== this.networkMeta.genesisHash) {
      throw new Error(
        `Network genesisHash ="${network.genesisHash}" doesn't match expected genesisHash "${this.networkMeta.genesisHash}"`
      );
    }

    return this;
  }

  getApi(): ApiPromise {
    return this.api;
  }

  async getPatchedApi(blockHash: string | BlockHash, parentBlockHash?: string | BlockHash): Promise<ApiAt> {
    this.currentBlockHash = blockHash.toString();
    if (parentBlockHash) {
      this.currentRuntimeVersion = await this.api.rpc.state.getRuntimeVersion(parentBlockHash);
    }
    const apiAt = (await this.api.at(blockHash, this.currentRuntimeVersion)) as ApiAt;
    this.patchApiRpc(this.api, apiAt);
    return apiAt;
  }

  private patchApiRpc(api: ApiPromise, apiAt: ApiAt): void {
    apiAt.rpc = Object.entries(api.rpc).reduce((acc, [module, rpcMethods]) => {
      acc[module] = Object.entries(rpcMethods).reduce((accInner, [name, rpcPromiseResult]) => {
        accInner[name] = this.redecorateRpcFunction(rpcPromiseResult);
        return accInner;
      }, {});
      return acc;
    }, {} as ApiPromise['rpc']);
  }

  private redecorateRpcFunction<T extends 'promise' | 'rxjs'>(
    original: RpcMethodResult<T, AnyFunction>
  ): RpcMethodResult<T, AnyFunction> {
    if (original.meta.params) {
      const hashIndex = original.meta.params.findIndex(({isHistoric}) => isHistoric);
      if (hashIndex > -1) {
        const ret = ((...args: unknown[]) => {
          const argsClone = [...args];
          argsClone[hashIndex] = this.currentBlockHash;
          return original(...argsClone);
        }) as RpcMethodResult<T, AnyFunction>;
        ret.raw = NOT_SUPPORT('api.rpc.*.*.raw');
        ret.meta = original.meta;
        return ret;
      }
    }
    const ret = NOT_SUPPORT('api.rpc.*.*') as unknown as RpcMethodResult<T, AnyFunction>;
    ret.raw = NOT_SUPPORT('api.rpc.*.*.raw');
    ret.meta = original.meta;
    return ret;
  }
}
