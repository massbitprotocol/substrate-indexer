import {BuildOptions, DataTypes, Model, Sequelize} from 'sequelize';

interface IndexerModelAttributes extends IndexerCreationAttributes {
  createdAt?: Date;
  updatedAt?: Date;
}

interface IndexerCreationAttributes {
  id: string;
  name: string;
  description: string;
  repository: string;
  imageUrl: string;
  dbSchema?: string;
  version?: string;
  hash?: string;
  nextBlockHeight?: number;
  network?: string;
  networkGenesis?: string;
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
        type: DataTypes.STRING,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      repository: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      imageUrl: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      dbSchema: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      version: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      hash: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      nextBlockHeight: {
        type: DataTypes.INTEGER,
        allowNull: true,
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
    {underscored: true}
  );
}
