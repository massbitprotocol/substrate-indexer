import {FieldScalar} from './types';

export function isFieldScalar(type: any): type is FieldScalar {
  return Object.values(FieldScalar).includes(type);
}
