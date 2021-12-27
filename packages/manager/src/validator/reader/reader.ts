import {IPackageJson} from 'package-json-type';
import {GithubReader} from './github-reader';

export interface Reader {
  getManifest(): Promise<unknown | undefined>;
  getPkg(): Promise<IPackageJson | undefined>;
  getFile(fileName: string): Promise<unknown | undefined>;
}

export class ReaderFactory {
  static new(location: string): Reader {
    const githubMatch = /https:\/\/github.com\/([\w-_]+\/[\w-_]+)/i.exec(location);
    if (githubMatch) {
      return new GithubReader(githubMatch[1]);
    }
    throw new Error(`unknown location: ${location}`);
  }
}
