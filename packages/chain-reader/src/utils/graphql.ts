import { GraphQLModelsType } from '@massbit/common/graphql/types';
import {
  isHex,
  hexToU8a,
  u8aToBuffer,
  u8aToHex,
  bufferToU8a,
  isBuffer,
  isNull,
} from '@polkadot/util';
import { ModelAttributes, DataTypes } from 'sequelize';
import { ModelAttributeColumnOptions } from 'sequelize/types/lib/model';

const SEQUELIZE_TYPE_MAPPING = {
  ID: 'text',
  Int: 'integer',
  BigInt: 'numeric',
  String: 'text',
  Date: 'timestamp',
  BigDecimal: 'numeric',
  Boolean: 'boolean',
  Bytes: DataTypes.BLOB,
  Json: DataTypes.JSONB,
};

export function modelsTypeToModelAttributes(
  modelType: GraphQLModelsType,
  enums: Map<string, string>,
): ModelAttributes<any> {
  const fields = modelType.fields;
  return Object.values(fields).reduce((acc, field) => {
    const allowNull = field.nullable;
    const columnOption: ModelAttributeColumnOptions<any> = {
      type: field.isEnum
        ? `${enums.get(field.type)}${field.isArray ? '[]' : ''}`
        : field.isArray
        ? SEQUELIZE_TYPE_MAPPING.Json
        : SEQUELIZE_TYPE_MAPPING[field.type],
      comment: field.description,
      allowNull,
      primaryKey: field.type === 'ID',
    };
    if (field.type === 'BigInt') {
      columnOption.get = function () {
        const dataValue = this.getDataValue(field.name);
        return dataValue ? BigInt(dataValue) : null;
      };
      columnOption.set = function (val: unknown) {
        this.setDataValue(field.name, val?.toString());
      };
    }
    if (field.type === 'Bytes') {
      columnOption.get = function () {
        const dataValue = this.getDataValue(field.name);
        if (!dataValue) {
          return null;
        }
        if (!isBuffer(dataValue)) {
          throw new Error(
            `Bytes: store.get() returned type is not buffer type`,
          );
        }
        return u8aToHex(bufferToU8a(dataValue));
      };
      columnOption.set = function (val: unknown) {
        if (val === undefined || isNull(val)) {
          this.setDataValue(field.name, null);
        } else if (isHex(val)) {
          const setValue = u8aToBuffer(hexToU8a(val));
          this.setDataValue(field.name, setValue);
        } else {
          throw new Error(
            `input for Bytes type is only support unprefixed hex`,
          );
        }
      };
    }
    acc[field.name] = columnOption;
    return acc;
  }, {} as ModelAttributes<any>);
}

export function isBasicType(t: string): boolean {
  return Object.keys(SEQUELIZE_TYPE_MAPPING).findIndex((k) => k === t) >= 0;
}
