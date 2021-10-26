import fs from 'fs';
import {buildASTSchema, DocumentNode, extendSchema, GraphQLSchema, parse, Source} from 'graphql';
import {directives} from './schema/directives';
import {scalars} from './schema/scalars';

function loadBaseSchema(): GraphQLSchema {
  const schema = buildASTSchema(scalars);
  return extendSchema(schema, directives);
}

export function buildSchema(path: string): GraphQLSchema {
  const src = new Source(fs.readFileSync(path).toString());
  const doc = parse(src);
  return buildSchemaFromDocumentNode(doc);
}

export function buildSchemaFromDocumentNode(doc: DocumentNode): GraphQLSchema {
  return extendSchema(loadBaseSchema(), doc);
}
