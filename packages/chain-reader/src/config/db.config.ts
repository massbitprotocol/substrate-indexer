import {registerAs} from '@nestjs/config';
import pluralize from 'pluralize';
import {DefaultNamingStrategy} from 'typeorm';
import {snakeCase} from 'typeorm/util/StringUtils';

export default registerAs('db', () => ({
  type: process.env.ORM_CONNECTION,
  host: process.env.ORM_HOST,
  port: process.env.ORM_PORT,
  username: process.env.ORM_USERNAME,
  password: process.env.ORM_PASSWORD,
  database: process.env.ORM_DB,
  schema: process.env.ORM_SCHEMA || 'public',
  timezone: 'Z',
  logging: process.env.ORM_LOGGING === 'true',
  autoLoadEntities: true,
  keepConnectionAlive: true,
  entities: [`${__dirname}/**/*.entity{.ts,.js}`],
  namingStrategy: new NamingStrategy(),
  extra: {
    connectionLimit: 10,
  },
}));

export class NamingStrategy extends DefaultNamingStrategy {
  // eslint-disable-next-line class-methods-use-this
  tableName(targetName: string, userSpecifiedName: string | undefined): string {
    return userSpecifiedName || pluralize(snakeCase(targetName));
  }

  columnName(propertyName: string, customName: string, embeddedPrefixes: string[]): string {
    return snakeCase(propertyName);
  }
}
