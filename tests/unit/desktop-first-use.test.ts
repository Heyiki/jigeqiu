import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageManager } from '../../src/services/storage';
import { MemoryStorage } from '../support/memory-storage';

test('fresh desktop reads an empty layout without writing and first folder saves once', () => {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  const store = new StorageManager();
  assert.deepEqual(store.getDesktopLayout(), { shortcuts: [], folders: [], root: [], dock: [] });
  assert.equal(memory.length, 0);
  const layout = store.executeDesktop([{ type: 'desktop.folder.create', id: 'first-folder',
    name: 'Work', shortcutIds: [], index: 0 }]);
  assert.equal(layout.folders[0].id, 'first-folder');
  assert.deepEqual(new StorageManager().getDesktopLayout(), layout);
});

test('first bookmark and shortcut save atomically without migration', () => {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  const store = new StorageManager();
  const bookmark = store.saveManualBookmark({
    title: 'First', url: 'https://first.example/', domain: 'first.example', category: '',
    order: 0, collectionIds: [], pinnedToDesktop: true,
  }, undefined, {});
  const stored = JSON.parse(memory.getItem('jipage_library_v2')!);
  assert.equal(stored.bookmarks.length, 1);
  assert.equal(stored.desktopLayout.shortcuts[0].bookmarkId, bookmark.id);
  assert.equal(stored.bookmarks[0].pinnedToDesktop, false);
});
