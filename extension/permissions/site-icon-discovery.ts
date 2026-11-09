import { createSiteIconDiscovery } from '../../src/services/site-icon-discovery';
import { permissionFetch } from './network';
export * from '../../src/services/site-icon-discovery';

export const discoverSiteIcons = createSiteIconDiscovery({
  fetch: permissionFetch,
  createImage: () => new Image(),
});
