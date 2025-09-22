// babel.config.js
module.exports = {
  presets: ['babel-preset-expo'], // includes expo-router transforms in SDK 54
  plugins: [
    [
      'module-resolver',
      {
        root: ["./project"],
        alias: { "@": "./project" },
        // helps Babel resolve TS files during transform
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      },
    ],
  ],
};
