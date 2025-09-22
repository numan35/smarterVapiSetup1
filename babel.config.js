module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['module-resolver', {
        root: ['./'],          // repo root
        alias: { '@': './' },  // "@/lib/supabase" => ./lib/supabase
        extensions: ['.tsx', '.ts', '.js', '.json']
      }],
      'expo-router/babel',
    ],
  };
};
