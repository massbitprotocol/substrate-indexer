import {PgEntity, PgEntityKind} from 'graphile-build-pg';
import {makePgSmartTagsPlugin} from 'graphile-utils';

export const smartTagsPlugin = makePgSmartTagsPlugin({
  // Rule 1, omit `_metadata` from node
  kind: PgEntityKind.CLASS,
  match: ({name}: PgEntity) => /_metadata/.test(name),
  tags: {
    omit: true,
  },
});
