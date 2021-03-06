import {Body, Controller, Param, Post} from '@nestjs/common';
import {getIntrospectionQuery, graphql, GraphQLSchema} from 'graphql';
import {Pool} from 'pg';
import {withPostGraphileContext} from 'postgraphile';
import {getPostGraphileBuilder} from 'postgraphile-core';
import {Config} from '../configure';
import {IndexerService} from './indexer.service';
import {Query} from './model';
import {plugins} from './plugins';

@Controller('indexers')
export class IndexerController {
  private cacheSchemas: Record<string, GraphQLSchema> = {};

  constructor(
    private readonly config: Config,
    private readonly pgPool: Pool,
    private readonly projectService: IndexerService
  ) {}

  @Post('/:id/graphql')
  async query(@Param('id') id: string, @Body() request: Query): Promise<unknown> {
    const {operationName} = request;
    let query: string;
    if (operationName === 'IntrospectionQuery') {
      query = getIntrospectionQuery();
    } else {
      query = request.query;
    }
    const dbSchema = await this.projectService.getIndexerSchema(id);
    if (!this.cacheSchemas[dbSchema]) {
      const builder = await getPostGraphileBuilder(this.pgPool, [dbSchema], {
        replaceAllPlugins: plugins,
        subscriptions: true,
        dynamicJson: true,
      });
      this.cacheSchemas[dbSchema] = builder.buildSchema();
    }
    const schema = this.cacheSchemas[dbSchema];
    const result = await withPostGraphileContext({pgPool: this.pgPool}, async (context) => {
      // eslint-disable-next-line no-return-await
      return await graphql(
        schema,
        query,
        null,
        {
          ...context,
        },
        {}
      );
    });
    return result.data;
  }
}
