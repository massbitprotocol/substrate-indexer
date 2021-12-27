import {Context} from '../context';
import {Rule, RuleType} from './rule';

export class RequireValidManifest implements Rule {
  type = RuleType.Manifest;
  name = 'require-valid-manifest';
  description = '`project.yaml` must match the schema';

  validate(ctx: Context): boolean {
    const manifest = ctx.data.manifest;
    try {
      manifest.validate();
      return true;
    } catch (e) {
      ctx.logger.error(e.message);
      return false;
    }
  }
}
