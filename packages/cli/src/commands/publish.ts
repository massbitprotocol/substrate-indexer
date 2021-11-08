import fs from 'fs';
import {Command} from '@oclif/command';
import admZip from 'adm-zip';
import axios from 'axios';
import FormData from 'form-data';

export default class Publish extends Command {
  static description = 'Publish Indexer';

  async run(): Promise<void> {
    this.log('===============================');
    this.log('---------Publish Indexer---------');
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
    await axios.post('http://127.0.0.1:3000/indexers', form, {
      headers: {
        ...form.getHeaders(),
      },
    });
  }
}
