import assert from 'assert';
import {GraphQLModelsRelationsEnums, camelCaseObjectKey} from '@massbit/common';
import {Entity, Store} from '@massbit/types';
import {Injectable} from '@nestjs/common';
import {camelCase, flatten, upperFirst} from 'lodash';
import {QueryTypes, Sequelize, Transaction, Utils} from 'sequelize';
import {Config} from '../configure/config';
import {modelsTypeToModelAttributes} from '../utils/graphql';
import {commentConstraintQuery, createUniqueIndexQuery, getFkConstraint, smartTags} from '../utils/sync-helper';
import {MetadataFactory, MetadataRepo} from './entities/metadata.entity';

interface IndexField {
  entityName: string;
  fieldName: string;
  isUnique: boolean;
  type: string;
}

@Injectable()
export class StoreService {
  private tx?: Transaction;
  private modelIndexedFields: IndexField[];
  private dbSchema: string;
  private modelsRelations: GraphQLModelsRelationsEnums;
  private metaDataRepo: MetadataRepo;

  constructor(private sequelize: Sequelize, private config: Config) {}

  async init(modelsRelations: GraphQLModelsRelationsEnums, dbSchema: string): Promise<void> {
    this.dbSchema = dbSchema;
    this.modelsRelations = modelsRelations;
    await this.syncSchema(this.dbSchema);
    this.modelIndexedFields = await this.getAllIndexFields(this.dbSchema);
  }

  async syncSchema(schema: string): Promise<void> {
    const enumTypeMap = new Map<string, string>();

    let i = 0;
    for (const e of this.modelsRelations.enums) {
      // We shouldn't set the typename to e.name because it could potentially create SQL injection,
      // using a replacement at the type name location doesn't work.
      const enumTypeName = `${schema}_custom_enum_${i}`;

      const [results] = await this.sequelize.query(
        `select e.enumlabel as enum_value
         from pg_type t
         join pg_enum e on t.oid = e.enumtypid
         where t.typname = ?;`,
        {replacements: [enumTypeName]}
      );

      if (results.length === 0) {
        await this.sequelize.query(`CREATE TYPE ${enumTypeName} as ENUM (${e.values.map(() => '?').join(',')});`, {
          replacements: e.values,
        });
      } else {
        const currentValues = results.map((v: any) => v.enum_value);
        // Assert the existing enum has the same values

        // Make it a function to not execute potentially big joins unless needed
        const differentValuesError = () =>
          new Error(
            `Can't modify enum ${enumTypeName} between runs, it used to have values: ${currentValues.join(
              ', '
            )} but now has ${e.values.join(', ')} you must rerun the full indexer to do such a change`
          );

        if (e.values.length !== currentValues.length) {
          throw differentValuesError();
        }
        const newSet = new Set(e.values);
        for (const value of currentValues) {
          if (!newSet.has(value)) {
            throw differentValuesError();
          }
        }
      }

      const comment = `@enum\\n@enumName ${e.name}${e.description ? `\\n ${e.description}` : ''}`;

      await this.sequelize.query(`COMMENT ON TYPE ${enumTypeName} IS E?`, {
        replacements: [comment],
      });
      enumTypeMap.set(e.name, enumTypeName);

      i++;
    }

    for (const model of this.modelsRelations.models) {
      const attributes = modelsTypeToModelAttributes(model, enumTypeMap);
      const indexes = model.indexes.map(({fields, unique, using}) => ({
        fields: fields.map((field) => Utils.underscoredIf(field, true)),
        unique,
        using,
      }));
      if (indexes.length > this.config.indexCountLimit) {
        throw new Error(`too many indexes on entity ${model.name}`);
      }
      this.sequelize.define(model.name, attributes, {
        underscored: true,
        comment: model.description,
        freezeTableName: false,
        createdAt: this.config.timestampField,
        updatedAt: this.config.timestampField,
        schema,
        indexes,
      });
    }
    const extraQueries = [];
    for (const relation of this.modelsRelations.relations) {
      const model = this.sequelize.model(relation.from);
      const relatedModel = this.sequelize.model(relation.to);
      switch (relation.type) {
        case 'belongsTo': {
          model.belongsTo(relatedModel, {foreignKey: relation.foreignKey});
          break;
        }
        case 'hasOne': {
          const rel = model.hasOne(relatedModel, {
            foreignKey: relation.foreignKey,
          });
          const fkConstraint = getFkConstraint(rel.target.tableName, rel.foreignKey);
          const tags = smartTags({
            singleForeignFieldName: relation.fieldName,
          });
          extraQueries.push(
            commentConstraintQuery(`${schema}.${rel.target.tableName}`, fkConstraint, tags),
            createUniqueIndexQuery(schema, relatedModel.tableName, relation.foreignKey)
          );
          break;
        }
        case 'hasMany': {
          const rel = model.hasMany(relatedModel, {
            foreignKey: relation.foreignKey,
          });
          const fkConstraint = getFkConstraint(rel.target.tableName, rel.foreignKey);
          const tags = smartTags({
            foreignFieldName: relation.fieldName,
          });
          extraQueries.push(commentConstraintQuery(`${schema}.${rel.target.tableName}`, fkConstraint, tags));

          break;
        }
        default:
          throw new Error('Relation type is not supported');
      }
    }
    this.metaDataRepo = MetadataFactory(this.sequelize, schema);

    await this.sequelize.sync();
    for (const query of extraQueries) {
      await this.sequelize.query(query);
    }
  }

  setTransaction(tx: Transaction): void {
    this.tx = tx;
    tx.afterCommit(() => (this.tx = undefined));
  }

  async setMetadata(key: string, value: string | number | boolean): Promise<void> {
    assert(this.metaDataRepo, `model _metadata does not exist`);
    await this.metaDataRepo.upsert({key, value});
  }

  private async getAllIndexFields(schema: string) {
    const fields: IndexField[][] = [];
    for (const entity of this.modelsRelations.models) {
      const model = this.sequelize.model(entity.name);
      const tableFields = await this.packEntityFields(schema, entity.name, model.tableName);
      fields.push(tableFields);
    }
    return flatten(fields);
  }

  private async packEntityFields(schema: string, entity: string, table: string): Promise<IndexField[]> {
    const rows = await this.sequelize.query(
      `select
    '${entity}' as entity_name,
    a.attname as field_name,
    idx.indisunique as is_unique,
    am.amname as type
from
    pg_index idx
    JOIN pg_class cls ON cls.oid=idx.indexrelid
    JOIN pg_class tab ON tab.oid=idx.indrelid
    JOIN pg_am am ON am.oid=cls.relam,
    pg_namespace n,
    pg_attribute a
where
  n.nspname = '${schema}'
  and tab.relname = '${table}'
  and a.attrelid = tab.oid
  and a.attnum = ANY(idx.indkey)
  and not idx.indisprimary
group by
    n.nspname,
    a.attname,
    tab.relname,
    idx.indisunique,
    am.amname`,
      {
        type: QueryTypes.SELECT,
      }
    );
    return rows.map((result) => camelCaseObjectKey(result)) as IndexField[];
  }

  getStore(): Store {
    return {
      get: async (entity: string, id: string): Promise<Entity | undefined> => {
        const model = this.sequelize.model(entity);
        assert(model, `model ${entity} not exists`);
        const record = await model.findOne({
          where: {id},
          transaction: this.tx,
        });
        return record?.toJSON() as Entity;
      },
      getByField: async (entity: string, field: string, value): Promise<Entity[] | undefined> => {
        const model = this.sequelize.model(entity);
        assert(model, `model ${entity} not exists`);
        const indexed =
          this.modelIndexedFields.findIndex(
            (indexField) =>
              upperFirst(camelCase(indexField.entityName)) === entity && camelCase(indexField.fieldName) === field
          ) > -1;
        assert(indexed, `to query by field ${field}, an index must be created on model ${entity}`);
        const records = await model.findAll({
          where: {[field]: value},
          transaction: this.tx,
          limit: this.config.queryLimit,
        });
        return records.map((record) => record.toJSON() as Entity);
      },
      getOneByField: async (entity: string, field: string, value): Promise<Entity | undefined> => {
        const model = this.sequelize.model(entity);
        assert(model, `model ${entity} not exists`);
        const indexed =
          this.modelIndexedFields.findIndex(
            (indexField) =>
              upperFirst(camelCase(indexField.entityName)) === entity &&
              camelCase(indexField.fieldName) === field &&
              indexField.isUnique
          ) > -1;
        assert(indexed, `to query by field ${field}, an unique index must be created on model ${entity}`);
        const record = await model.findOne({
          where: {[field]: value},
          transaction: this.tx,
        });
        return record?.toJSON() as Entity;
      },
      set: async (entity: string, id: string, data: Entity): Promise<void> => {
        const model = this.sequelize.model(entity);
        assert(model, `model ${entity} not exists`);
        await model.upsert(data, {transaction: this.tx});
      },
      remove: async (entity: string, id: string): Promise<void> => {
        const model = this.sequelize.model(entity);
        assert(model, `model ${entity} not exists`);
        await model.destroy({where: {id}, transaction: this.tx});
      },
    };
  }
}
