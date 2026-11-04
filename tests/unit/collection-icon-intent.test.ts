import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Bookmark, CollectionItem } from '../../src/types';
import { StorageManager } from '../../src/services/storage';
import { MemoryStorage } from '../support/memory-storage';

const source = readFileSync(new URL('../../src/PrototypeApp.tsx', import.meta.url), 'utf8');
test('open-source entry neither mounts collections nor exposes collection search or save callbacks', () => {
  assert.doesNotMatch(source, /<LocalCollections|onSaveBookmark=\{item =>|navigateManagement\('collections'\)|onSaveFolderAsCollection=/);
  assert.match(source, /collections=\{\[\]\}/);
});

// Legacy icon fields remain valid storage input even after collection UI is deferred.
const buildPayload = (item: CollectionItem): Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'> => ({
  title: item.title, url: item.url, domain: item.domain, icon: item.icon, iconMode: item.iconMode,
  category: 'cat-inbox', order: 0, collectionIds: ['collection-1'], pinnedToDesktop: false,
});

const cases = [
  { name: 'text', choice: { iconMode: 'text' as const }, icon: undefined, mode: 'text' },
  {
    name: 'custom', choice: { iconMode: 'custom' as const, icon: 'https://cdn.example/custom.png' },
    icon: 'https://cdn.example/custom.png', mode: 'custom',
  },
  {
    name: 'automatic', choice: { iconMode: 'auto' as const, icon: 'https://example.test/apple-touch-icon.png' },
    icon: 'https://example.test/apple-touch-icon.png', mode: 'auto',
  },
  {
    name: 'legacy explicit', choice: { icon: 'https://cdn.example/legacy.png' },
    icon: 'https://cdn.example/legacy.png', mode: undefined,
  },
];

for (const { name, choice, icon, mode } of cases) {
  test(`saving a collection item to the library preserves ${name} icon intent`, () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const memory = new MemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
    try {
      memory.setItem('jipage_bookmarks_v1', '[]');
      memory.setItem('jipage_folders_v1', '[]');
      const item: CollectionItem = {
        bookmarkId: 'removed-original', title: 'Collection site', url: 'https://example.test/',
        domain: 'example.test', order: 1, ...choice,
      };
      const storage = new StorageManager();
      storage.saveManualBookmark(buildPayload(item));
      const [saved] = new StorageManager().getBookmarks();
      assert.equal(saved.iconMode, mode, 'Saved bookmark must retain the collection icon mode');
      assert.equal(saved.icon, icon, 'Saved bookmark must retain the selected image URL');
      assert.deepEqual(saved.collectionIds, ['collection-1']);
      assert.equal(saved.pinnedToDesktop, false, 'Saving a collection item must not pin it to the desktop');
      assert.equal(saved.url, 'https://example.test/');
    } finally {
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
}
