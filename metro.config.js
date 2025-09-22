// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;

module.exports = (async () => {
  const config = await getDefaultConfig(projectRoot);

  // Allow Metro to resolve files from the `project/` dir
  config.watchFolders = [
    path.resolve(projectRoot, 'project'),
  ];

  // Make sure node_modules resolution still works
  config.resolver = {
    ...config.resolver,
    extraNodeModules: new Proxy(
      {},
      {
        get: (target, name) =>
          path.join(projectRoot, 'node_modules', name),
      }
    ),
  };

  return config;
})();
