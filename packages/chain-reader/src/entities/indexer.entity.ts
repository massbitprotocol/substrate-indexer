import { BuildOptions, DataTypes, Model, Sequelize } from 'sequelize';

interface IndexerModelAttributes extends IndexerCreationAttributes {
  id: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface IndexerCreationAttributes {
  name: string;
  dbSchema: string;
  version?: string;
  hash: string;
  nextBlockHeight?: number;
  network: string;
  networkGenesis: string;
}

export interface IndexerModel
  extends Model<IndexerModelAttributes, IndexerCreationAttributes>,
    IndexerModelAttributes {}

export type IndexerRepo = typeof Model & {
  new (values?: unknown, options?: BuildOptions): IndexerModel;
};

export function IndexerFactory(sequelize: Sequelize): IndexerRepo {
  return <IndexerRepo>sequelize.define(
    'Indexer',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      dbSchema: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      hash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      nextBlockHeight: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      network: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      networkGenesis: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    { underscored: true },
  );
}
