/*
  Single source of the application's identity and build metadata for the whole client.
  The version, build revision, and source date are injected by vite.config.js, which resolves
  them from the release environment or from Git, so nothing here is edited for a release.
*/
export const appInfo = {
  name: 'Inventory Atlas Lite',
  developer: 'Artem Bloschinsky',
  repositoryUrl: 'https://github.com/bloschinsky/inventory-atlas-lite',
  ...__APP_BUILD_INFO__
};
