module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-worklets/plugin powers Reanimated 4 worklets.
    // MUST be the last plugin in the list.
    plugins: ['react-native-worklets/plugin'],
  };
};
