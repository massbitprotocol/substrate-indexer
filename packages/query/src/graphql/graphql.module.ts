import {Module, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {HttpAdapterHost} from '@nestjs/core';
import {ApolloServer} from 'apollo-server-express';
import ExpressPinoLogger from 'express-pino-logger';
import {Pool} from 'pg';
import {getPostGraphileBuilder} from 'postgraphile-core';
import {Config} from '../configure';
import {getLogger} from '../utils/logger';
import {IndexerService} from './indexer.service';
import {plugins} from './plugins';

const DEFAULT_DB_SCHEMA = 'public';

@Module({
  providers: [IndexerService],
})
export class GraphqlModule implements OnModuleInit, OnModuleDestroy {
  private apolloServer: ApolloServer;

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly config: Config,
    private readonly pgPool: Pool,
    private readonly projectService: IndexerService
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.httpAdapterHost) {
      return;
    }
    this.apolloServer = await this.createServer();
  }

  async onModuleDestroy(): Promise<void> {
    return this.apolloServer?.stop();
  }

  private async createServer() {
    const app = this.httpAdapterHost.httpAdapter.getInstance();
    const httpServer = this.httpAdapterHost.httpAdapter.getHttpServer();

    let dbSchema: string;
    if (this.config.get('indexer-name')) {
      dbSchema = await this.projectService.getIndexerSchema(this.config.get('indexer-name'));
    } else {
      dbSchema = DEFAULT_DB_SCHEMA;
    }

    const builder = await getPostGraphileBuilder(this.pgPool, [dbSchema], {
      replaceAllPlugins: plugins,
      subscriptions: true,
      dynamicJson: true,
    });

    const schema = builder.buildSchema();
    const server = new ApolloServer({
      schema,
      context: {
        pgClient: this.pgPool,
      },
      cacheControl: {
        defaultMaxAge: 5,
      },
      debug: this.config.get('NODE_ENV') !== 'production',
      playground: this.config.get('playground'),
      subscriptions: {
        path: '/subscription',
      },
    });
    app.use(
      ExpressPinoLogger({
        logger: getLogger('express'),
        autoLogging: {
          ignorePaths: ['/.well-known/apollo/server-health'],
        },
      })
    );
    server.applyMiddleware({
      app,
      path: '/',
      cors: true,
    });
    server.installSubscriptionHandlers(httpServer);

    return server;
  }
}
