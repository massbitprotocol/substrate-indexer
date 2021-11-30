import {Body, Controller, Get, Param, Post} from '@nestjs/common';
import {graphql, printSchema} from 'graphql';
import {Pool} from 'pg';
import {withPostGraphileContext} from 'postgraphile';
import {getPostGraphileBuilder} from 'postgraphile-core';
import {Config} from '../configure';
import {IndexerService} from './indexer.service';
import {Query} from './model';
import {plugins} from './plugins';

@Controller('indexers')
export class IndexerController {
  constructor(
    private readonly config: Config,
    private readonly pgPool: Pool,
    private readonly projectService: IndexerService
  ) {}

  @Get('/:id/graphql/schema')
  async getSchema(@Param('id') id: string): Promise<unknown> {
    const dbSchema = await this.projectService.getIndexerSchema(id);
    const builder = await getPostGraphileBuilder(this.pgPool, [dbSchema], {
      replaceAllPlugins: plugins,
      subscriptions: true,
      dynamicJson: true,
    });
    const schema = builder.buildSchema();
    return {schema: printSchema(schema)};
  }

  @Post('/:id/graphql')
  async query(@Param('id') id: string, @Body() queryRequest: Query): Promise<unknown> {
    const {query} = queryRequest;
    const dbSchema = await this.projectService.getIndexerSchema(id);
    const builder = await getPostGraphileBuilder(this.pgPool, [dbSchema], {
      replaceAllPlugins: plugins,
      subscriptions: true,
      dynamicJson: true,
    });
    const schema = builder.buildSchema();
    const result = await withPostGraphileContext({pgPool: this.pgPool}, async (context) => {
      // eslint-disable-next-line no-return-await
      return await graphql(
        schema,
        query,
        null,
        {
          ...context,
        },
        {},
        null
      );
    });
    return result;
  }
}
