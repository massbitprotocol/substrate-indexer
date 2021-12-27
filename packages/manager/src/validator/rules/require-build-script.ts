import {Context} from '../context';
import {Rule, RuleType} from './rule';

export class RequireBuildScript implements Rule {
  type = RuleType.PackageJson;
  name = 'require-build-script';
  description = 'A `build` script in `package.json` is required to compile indexer';

  validate(ctx: Context): boolean {
    return 'build' in ctx.data.pkg.scripts;
  }
}
