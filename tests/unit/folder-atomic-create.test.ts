import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageManager } from '../../src/services/storage';
import { MemoryStorage } from '../support/memory-storage';

const key = 'jipage_library_v2';
function setup() {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  const manager = new StorageManager();
  const old = manager.createFolder('Old');
  const bookmark = manager.saveManualBookmark({
    title: 'Keep', url: 'https://keep.example/', domain: 'keep.example', category: 'cat-inbox',
    order: 1, collectionIds: [], pinnedToDesktop: false, folderId: old.id,
  });
  return { memory, manager, old, bookmark };
}

test('create folder and move bookmarks uses one complete write and removes old membership', () => {
  const { memory, manager, old, bookmark } = setup();
  const original = memory.setItem.bind(memory);
  const commits: string[] = [];
  memory.setItem = (name, value) => {
    if (name === key) commits.push(value);
    original(name, value);
  };
  const created = manager.createFolder('New', [bookmark.id, bookmark.id], old.id);
  assert.equal(commits.length, 1);
  const data = JSON.parse(commits[0]);
  assert.deepEqual(created.bookmarkIds, [bookmark.id]);
  assert.deepEqual(data.folders.find((item: { id: string }) => item.id === old.id).bookmarkIds, []);
  assert.equal(data.bookmarks[0].folderId, created.id);
  const reloaded = new StorageManager();
  assert.equal(reloaded.getBookmarks()[0].folderId, created.id);
  assert.equal(reloaded.getFolders().find(item => item.id === created.id)?.parentId, old.id);
});

test('failed combined creation keeps all original bytes and allows retry without phantom folders', () => {
  const { memory, manager, bookmark } = setup();
  const before = memory.getItem(key);
  memory.failWrites = true;
  assert.throws(() => manager.createFolder('Retry', [bookmark.id]),
    (error: unknown) => error instanceof DOMException && error.name === 'SecurityError');
  assert.equal(memory.getItem(key), before);
  memory.failWrites = false;
  const created = manager.createFolder('Retry', [bookmark.id]);
  assert.equal(new StorageManager().getFolders().filter(item => item.name === 'Retry').length, 1);
  assert.equal(new StorageManager().getBookmarks()[0].folderId, created.id);
});

test('invalid parents, missing bookmarks and stale pages cannot partially create folders', () => {
  const { memory, manager, bookmark } = setup();
  const before = memory.getItem(key);
  assert.throws(() => manager.createFolder('Invalid', [bookmark.id], 'missing'), /INVALID_REFERENCE/);
  assert.throws(() => manager.createFolder('Invalid', ['missing']), /INVALID_REFERENCE/);
  assert.equal(memory.getItem(key), before);
  const stale = new StorageManager();
  stale.getBookmarks();
  stale.getFolders();
  manager.createFolder('Another');
  const latest = memory.getItem(key);
  assert.throws(() => stale.createFolder('Stale', [bookmark.id]), /CONFLICT/);
  assert.equal(memory.getItem(key), latest);
});

test('creating an archive folder never changes independent desktop or Dock shortcuts', () => {
  const { memory, manager, bookmark } = setup();
  manager.executeDesktop([
    { type: 'desktop.pin', bookmarkId: bookmark.id, shortcutId: 'shortcut', to: { kind: 'root', index: 0 } },
    { type: 'desktop.folder.create', id: 'desktop-old', name: 'Old', shortcutIds: ['shortcut'], index: 0 },
  ]);
  const before = JSON.parse(memory.getItem(key)!);
  manager.createFolder('Archive', [bookmark.id]);
  assert.deepEqual(JSON.parse(memory.getItem(key)!).desktopLayout, before.desktopLayout);
});
