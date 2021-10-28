import {registerAs} from '@nestjs/config';

export default registerAs('db', () => ({
  type: process.env.ORM_CONNECTION,
  host: process.env.ORM_HOST,
  port: process.env.ORM_PORT,
  username: process.env.ORM_USERNAME,
  password: process.env.ORM_PASSWORD,
  database: process.env.ORM_DB,
  timezone: 'Z',
  logging: process.env.ORM_LOGGING === 'true',
  autoLoadEntities: true,
  keepConnectionAlive: true,
  entities: [`${__dirname}/**/*.entity{.ts,.js}`],
  extra: {
    connectionLimit: 10,
  },
}));
