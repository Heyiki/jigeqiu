import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageManager } from '../../src/services/storage';
import { MemoryStorage } from '../support/memory-storage';

function setup() {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  return memory;
}
const input = {
  title: 'Personal', url: 'https://personal.example/', domain: 'personal.example',
  category: 'cat-inbox', pinnedToDesktop: false, order: 0, collectionIds: [],
};

test('fresh formal storage reads empty assets without writing sample content', () => {
  const memory = setup();
  const manager = new StorageManager();
  assert.deepEqual(manager.getBookmarks(), []);
  assert.deepEqual(manager.getFolders(), []);
  assert.deepEqual(manager.getCollections(), []);
  assert.equal(memory.length, 0);
});

test('legacy asset writes surface write denial and keep original bytes', () => {
  const memory = setup();
  memory.setItem('jipage_bookmarks_v1', '[]');
  memory.setItem('jipage_folders_v1', '[]');
  const manager = new StorageManager();
  manager.getBookmarks();
  manager.getFolders();
  memory.failWrites = true;
  assert.throws(() => manager.createFolder('Draft'));
  assert.equal(memory.getItem('jipage_library_v2'), null);
  assert.equal(memory.getItem('jipage_folders_v1'), '[]');
});

test('a stale page without a desktop layout cannot overwrite another page even after reading', () => {
  setup();
  const first = new StorageManager();
  const stale = new StorageManager();
  first.getBookmarks();
  stale.getBookmarks();
  first.saveManualBookmark(input);
  stale.getBookmarks();
  assert.throws(() => stale.saveManualBookmark({ ...input, url: 'https://other.example/' }), /CONFLICT/);
  assert.deepEqual(new StorageManager().getBookmarks().map(item => item.title), ['Personal']);
});

test('corrupt legacy assets are not replaced by sample data or overwritten', () => {
  const memory = setup();
  memory.setItem('jipage_bookmarks_v1', '{broken');
  const manager = new StorageManager();
  assert.throws(() => manager.getBookmarks(), /CORRUPT_DATA/);
  assert.throws(() => manager.saveManualBookmark(input), /CORRUPT_DATA/);
  assert.equal(memory.getItem('jipage_bookmarks_v1'), '{broken');
  assert.equal(memory.getItem('jipage_library_v2'), null);
});

test('first successful folder save keeps legacy bytes and survives a fresh manager', () => {
  const memory = setup();
  const raw = JSON.stringify([{ ...input, id: 'old', createdAt: 1, updatedAt: 1 }]);
  memory.setItem('jipage_bookmarks_v1', raw);
  memory.setItem('jipage_folders_v1', '[]');
  const manager = new StorageManager();
  const folder = manager.createFolder('My folder');
  const fresh = new StorageManager();
  assert.equal(fresh.getFolders()[0].id, folder.id);
  assert.equal(fresh.getBookmarks()[0].id, 'old');
  assert.equal(memory.getItem('jipage_bookmarks_v1'), raw);
  assert.equal(memory.getItem('jipage_folders_v1'), '[]');
});

test('first direct asset setter accepts an uninitialized baseline and preserves write error type', () => {
  const memory = setup();
  new StorageManager().saveBookmarks([]);
  new StorageManager().saveFolders([]);
  const before = memory.getItem('jipage_library_v2');
  memory.failWrites = true;
  for (const write of [
    () => new StorageManager().saveBookmarks([]),
    () => new StorageManager().saveFolders([]),
  ]) assert.throws(write, (error: unknown) => error instanceof DOMException && error.name === 'SecurityError');
  assert.equal(memory.getItem('jipage_library_v2'), before);
});
