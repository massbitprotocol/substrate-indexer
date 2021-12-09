PACKAGE_VERSION=$(cat ./packages/manager/package.json \
  | grep version \
  | head -1 \
  | awk -F: '{ print $2 }' \
  | sed 's/[",]//g' \
  | tr -d '[[:space:]]')

echo "::set-output name=MANAGER_VERSION::$PACKAGE_VERSION"
