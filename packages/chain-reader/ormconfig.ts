const baseOptions = {
  type: process.env.ORM_CONNECTION || 'postgres',
  host: process.env.ORM_HOST,
  port: process.env.ORM_PORT,
  username: process.env.ORM_USERNAME,
  password: process.env.ORM_PASSWORD,
  database: process.env.ORM_DB,
  timezone: 'Z',
  synchronize: false,
  dropSchema: false,
  entities: ['src/**/*.entity.ts'],
};

const defaultOptions = {
  migrationsRuns: true,
  logging: true,
  migrationsTableName: '__migrations',
  migrations: ['./migrations/**/*.ts'],
  cli: {
    entitiesDir: 'src',
    migrationsDir: './migrations',
  },
  ...baseOptions,
};

export default [defaultOptions];
