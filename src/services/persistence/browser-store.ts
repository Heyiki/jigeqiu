import { ASSET_KEY, createSnapshotStore } from './snapshot-store';
import type { CommitCoordinator, SnapshotStore } from './snapshot-store';

export function createBrowserSnapshotStore(target: Window = window): SnapshotStore {
  let locks: CommitCoordinator | null = null;
  try {
    const manager = target.navigator.locks;
    if (manager && typeof manager.request === 'function') {
      locks = {
        runExclusive: (name, task) => manager.request(name, { mode: 'exclusive' }, task),
      };
    }
  } catch {
    // Restricted or insecure browser contexts stay explicitly read-only.
  }
  return createSnapshotStore({
    storage: () => target.localStorage,
    locks,
    newStoreId: () => target.crypto.randomUUID(),
    changes: {
      subscribe(listener) {
        const storageChanged = (event: StorageEvent) => {
          try {
            if (event.storageArea === target.localStorage
              && (event.key === null || event.key === ASSET_KEY || /^jipage_.+_v1$/.test(event.key))) listener();
          } catch { listener(); }
        };
        const visible = () => { if (target.document.visibilityState === 'visible') listener(); };
        target.addEventListener('storage', storageChanged);
        target.addEventListener('focus', listener);
        target.document.addEventListener('visibilitychange', visible);
        return () => {
          target.removeEventListener('storage', storageChanged);
          target.removeEventListener('focus', listener);
          target.document.removeEventListener('visibilitychange', visible);
        };
      },
    },
  });
}
