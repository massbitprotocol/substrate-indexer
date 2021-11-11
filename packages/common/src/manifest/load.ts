import fs from 'fs';
import path from 'path';
import {plainToClass} from 'class-transformer';
import {validateSync} from 'class-validator';
import yaml from 'js-yaml';
import {ChainTypes} from './models';
import {ManifestVersioned, VersionedManifest} from './versions';

export function loadFromJsonOrYaml(file: string): unknown {
  const {ext} = path.parse(file);

  if (ext !== '.yaml' && ext !== '.yml' && ext !== '.json') {
    throw new Error(`Extension ${ext} not supported`);
  }

  const rawContent = fs.readFileSync(file, 'utf-8');
  return yaml.load(rawContent);
}

function loadFromFile(file: string): unknown {
  let filePath = file;
  if (fs.existsSync(file) && fs.lstatSync(file).isDirectory()) {
    filePath = path.join(file, 'project.yaml');
  }

  return loadFromJsonOrYaml(filePath);
}

export function loadProjectManifest(file: string): ManifestVersioned {
  const doc = loadFromFile(file);
  const projectManifest = new ManifestVersioned(doc as VersionedManifest);
  projectManifest.validate();
  return projectManifest;
}

export function parseChainTypes(raw: unknown): ChainTypes {
  const chainTypes = plainToClass(ChainTypes, raw);

  const errors = validateSync(chainTypes, {whitelist: true, forbidNonWhitelisted: true});
  if (errors?.length) {
    const errorMessages = errors.map((e) => e.toString()).join('\n');
    throw new Error(`failed to parse chain types.\n${errorMessages}`);
  }

  return chainTypes;
}