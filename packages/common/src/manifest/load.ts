import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import {Manifest, VersionedManifest} from './versions';

export function loadProjectManifest(file: string): Manifest {
  const rawManifest = loadFromFile(file);
  const manifest = new Manifest(rawManifest as VersionedManifest);
  manifest.validate();
  return manifest;
}

function loadFromFile(file: string): unknown {
  let filePath = file;
  if (fs.existsSync(file) && fs.lstatSync(file).isDirectory()) {
    filePath = path.join(file, 'project.yaml');
  }
  return loadFromJsonOrYaml(filePath);
}

export function loadFromJsonOrYaml(file: string): unknown {
  const {ext} = path.parse(file);
  if (ext !== '.yaml' && ext !== '.yml' && ext !== '.json') {
    throw new Error(`Extension ${ext} not supported`);
  }
  const rawContent = fs.readFileSync(file, 'utf-8');
  return yaml.load(rawContent);
}
