import path from 'path';
import {Command, flags} from '@oclif/command';
import {codegen} from '../controller/codegen-controller';

export default class Codegen extends Command {
  static description = 'Code generator';

  static flags = {
    force: flags.boolean({char: 'f'}),
    file: flags.string(),
    location: flags.string({char: 'l', description: 'local folder to run codegen in'}),
  };

  async run(): Promise<void> {
    const {flags} = this.parse(Codegen);
    this.log('===============================');
    this.log('---------Massbit Codegen---------');
    this.log('===============================');

    const location = flags.location ? path.resolve(flags.location) : process.cwd();
    try {
      await codegen(location);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }
}
