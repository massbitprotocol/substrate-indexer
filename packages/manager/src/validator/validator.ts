import {ManifestVersioned, VersionedManifest} from '@massbit/common';
import {Context} from './context';
import {Reader, ReaderFactory} from './reader';
import {baseRules, Rule, RuleType} from './rules/rule';

export interface Report {
  name: string;
  skipped: boolean;
  description: string;
  valid: boolean;
}

export class Validator {
  private readonly reader: Reader;
  private readonly rules: Rule[] = [];

  constructor(private readonly location: string) {
    this.reader = ReaderFactory.new(location);
    this.addRule(...baseRules);
  }

  addRule(...rules: Rule[]): void {
    this.rules.push(...rules);
  }

  async getValidationReports(): Promise<Report[]> {
    const reports: Report[] = [];
    const [pkg, rawManifest] = await Promise.all([this.reader.getPkg(), this.reader.getManifest()]);
    if (!rawManifest) {
      throw new Error(`Missing project.yaml`);
    }

    reports.push({
      name: 'project-yaml-file',
      description: 'A valid `project.yaml` file must exist in the root directory of the project',
      valid: !!rawManifest,
      skipped: false,
    });

    const manifest = new VersionedManifest(rawManifest as ManifestVersioned);

    if (manifest.isV0_0_1) {
      reports.push({
        name: 'package-json-file',
        description: 'A valid `package.json` file must exist in the root directory of the project',
        valid: !!pkg,
        skipped: false,
      });
    }

    const ctx: Context = {
      data: {
        projectPath: this.location,
        pkg,
        manifest,
      },
      reader: this.reader,
      logger: console,
    };

    for (const rule of this.rules) {
      const report = {
        name: rule.name,
        description: rule.description,
        valid: false,
        skipped: false,
      };
      if ((!pkg && rule.type === RuleType.PackageJson) || (!manifest && rule.type === RuleType.Manifest)) {
        report.skipped = true;
      } else {
        report.valid = await rule.validate(ctx);
      }
      reports.push(report);
    }
    return reports;
  }

  async validate(): Promise<boolean> {
    const reports = await this.getValidationReports();
    return !reports.some((r) => !r.valid);
  }
}
