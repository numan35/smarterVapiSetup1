module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['module-resolver', {
        root: ['./project'],
        alias: {
          '@': './project',
          '~': './'              // optional
        },
        extensions: ['.tsx', '.ts', '.js', '.json']
      }],
      'expo-router/babel',
    ],
  };
};
