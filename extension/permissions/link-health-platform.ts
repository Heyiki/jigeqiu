import type { LinkHealthPlatform } from '../../src/services/link-health-platform';
export { LINK_HEALTH_ORIGINS } from '../../src/services/link-health-platform';

interface PermissionAPI {
  getAll(): Promise<{ origins?: string[] }>;
  contains(permission: { origins: string[] }): Promise<boolean>;
  request(permission: { origins: string[] }): Promise<boolean>;
}

export function getLinkHealthPlatform(): LinkHealthPlatform | undefined {
  const chrome = (globalThis as typeof globalThis & {
    chrome?: { runtime?: { id?: string }; permissions?: PermissionAPI };
  }).chrome;
  if (!chrome?.runtime?.id || !chrome.permissions) return;
  const permissions = chrome.permissions;
  return {
    grants: async () => (await permissions.getAll()).origins ?? [],
    contains: origin => permissions.contains({ origins: [origin] }),
    // Called directly by a click handler, before any async work consumes the gesture.
    request: origins => permissions.request({ origins }),
    fetch: globalThis.fetch.bind(globalThis),
  };
}
