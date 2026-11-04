import type { AssetSnapshot } from '../../src/domain/assets/model';

export function emptySnapshot(): AssetSnapshot {
  return {
    library: { bookmarks: [], folders: [], root: [] },
    layout: { shortcuts: [], folders: [], root: [], dock: [] },
    collections: [],
    trash: [],
  };
}

export function bookmarkSnapshot(): AssetSnapshot {
  const snapshot = emptySnapshot();
  snapshot.library.bookmarks.push({
    id: 'b1', title: 'Example', url: 'https://example.com/', icon: null,
    notes: '', keywords: [], createdAt: 1, updatedAt: 1,
  });
  snapshot.library.root.push({ kind: 'bookmark', id: 'b1' });
  return snapshot;
}
