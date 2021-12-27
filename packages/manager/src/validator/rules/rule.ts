import {Context} from '../context';
import {RequireBuildScript} from './require-build-script';
import {RequireValidManifest} from './require-valid-manifest';

export enum RuleType {
  PackageJson = 'packageJson',
  Manifest = 'manifest',
}

export interface Rule {
  type: RuleType;
  name: string;
  description: string;

  validate(ctx: Context): boolean | Promise<boolean>;
}

export const baseRules: Rule[] = [new RequireBuildScript(), new RequireValidManifest()];
