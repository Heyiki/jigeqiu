export interface LinkHealthPlatform {
  grants(): Promise<string[]>;
  contains(origin: string): Promise<boolean>;
  request(origins: string[]): Promise<boolean>;
  fetch: typeof fetch;
}

/** One optional grant covers newly added bookmarks as well as the current library. */
export const LINK_HEALTH_ORIGINS = ['http://*/*', 'https://*/*'];

/** Replaced with a permission-gated adapter by the extension build. */
export function getLinkHealthPlatform(): LinkHealthPlatform | undefined { return undefined; }
