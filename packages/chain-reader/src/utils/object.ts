import { assignWith, camelCase, isUndefined } from 'lodash';

export function assign<TObject, TSource1, TSource2>(
  target: TObject,
  src: TSource1,
  src2?: TSource2,
): TObject & TSource1 & TSource2 {
  return assignWith(target, src, src2, (objValue, srcValue) =>
    isUndefined(srcValue) ? objValue : srcValue,
  );
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/ban-types
export function camelCaseObjectKey(object: object) {
  return Object.keys(object).reduce(
    (result, key) => ({
      ...result,
      [camelCase(key)]: object[key],
    }),
    {},
  );
}
