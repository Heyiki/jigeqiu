export interface SitePermissions {
  contains(permission: { origins: string[] }): Promise<boolean>;
  onAdded: {
    addListener(listener: () => void): void;
    removeListener(listener: () => void): void;
  };
  onRemoved: {
    addListener(listener: () => void): void;
    removeListener(listener: () => void): void;
  };
}

export function sitePermission(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return;
    return `https://${url.hostname}/*`;
  } catch {
    return;
  }
}

export function browserPermissions(): SitePermissions {
  return (
    globalThis as typeof globalThis & {
      chrome: { permissions: SitePermissions };
    }
  ).chrome.permissions;
}

export function createPermissionFetch(
  permissions: Pick<SitePermissions, 'contains'>,
  transport: typeof fetch,
): typeof fetch {
  return async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const origin = sitePermission(url);
    if (!origin || !(await permissions.contains({ origins: [origin] })))
      throw new TypeError('Site access has not been granted');
    init?.signal?.throwIfAborted();
    // Do not follow a redirect into a different, potentially ungranted site.
    return transport(input, {
      ...init,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
    });
  };
}

export const permissionFetch: typeof fetch = (input, init) =>
  createPermissionFetch(
    browserPermissions(),
    globalThis.fetch.bind(globalThis),
  )(input, init);
