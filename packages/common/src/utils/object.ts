import {assignWith, camelCase, isUndefined} from 'lodash';

export function assign<TObject, TSource1, TSource2>(
  target: TObject,
  src: TSource1,
  src2?: TSource2
): TObject & TSource1 & TSource2 {
  return assignWith(target, src, src2, (objValue, srcValue) => (isUndefined(srcValue) ? objValue : srcValue));
}

export function camelCaseObjectKey(object: {[index: string]: any}): {[index: string]: any} {
  return Object.keys(object).reduce(
    (result, key) => ({
      ...result,
      [camelCase(key)]: object[key],
    }),
    {}
  );
}
