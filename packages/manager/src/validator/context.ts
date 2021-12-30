import {Manifest} from '@massbit/common';
import {IPackageJson} from 'package-json-type';
import {Reader} from './reader';

export interface ContextData {
  projectPath: string;
  pkg: IPackageJson;
  manifest?: Manifest;
}
export interface Context {
  data: ContextData;
  reader: Reader;
  logger: Console;
}
