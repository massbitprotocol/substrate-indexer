import fs from 'fs';
import {Command, flags} from '@oclif/command';
import admZip from 'adm-zip';
import axios from 'axios';
import FormData from 'form-data';

export default class Deploy extends Command {
  static description = 'Deploy indexer';

  static flags = {
    endpoint: flags.string({
      char: 'l',
      description: 'manager endpoint for deploying indexers',
      default: '127.0.0.1:3000/indexers',
    }),
  };

  async run(): Promise<void> {
    const {flags} = this.parse(Deploy);
    this.log('===============================');
    this.log('---------Deploy indexer--------');
    this.log('===============================');
    const zip = new admZip();
    zip.addLocalFolder('./src', './src');
    zip.addLocalFile('./project.yaml');
    zip.addLocalFile('./schema.graphql');
    zip.addLocalFile('./package.json');
    zip.addLocalFile('./tsconfig.json');
    zip.toBuffer();
    const fileName = `${Date.now()}.zip`;
    zip.writeZip(`../${fileName}`);

    const form = new FormData();
    const file = await fs.promises.readFile(`../${fileName}`);
    form.append('file', file, fileName);
    await axios.post(flags.endpoint, form, {
      headers: {
        ...form.getHeaders(),
      },
    });
  }
}
