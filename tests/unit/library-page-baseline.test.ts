import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageManager } from '../../src/services/storage';
import { MemoryStorage } from '../support/memory-storage';

const key = 'jipage_library_v2';
const input = {
  title: 'Draft', url: 'https://draft.example/', domain: 'draft.example',
  category: '', pinnedToDesktop: false, order: 0, collectionIds: [],
};
function setup() {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  return memory;
}

test('a bookmark-only reader cannot adopt a later external folder change while saving', () => {
  const memory = setup();
  const stale = new StorageManager();
  stale.getBookmarks();
  new StorageManager().createFolder('From another page');
  stale.getFolders();
  const before = memory.getItem(key);
  assert.throws(() => stale.saveManualBookmark(input), /CONFLICT/);
  assert.equal(memory.getItem(key), before);
});

test('a legacy reader cannot rebase through a new JSON import preview', () => {
  const memory = setup();
  const stale = new StorageManager();
  stale.getBookmarks();
  const writer = new StorageManager();
  writer.createFolder('External');
  const preview = stale.previewJsonAssetImport(writer.exportJsonBackup(), true);
  const before = memory.getItem(key);
  assert.throws(() => stale.commitJsonAssetImport(preview), /CONFLICT/);
  assert.equal(memory.getItem(key), before);
});

test('read-only access leaves a page stale, while its own successful writes advance its baseline', () => {
  setup();
  const manager = new StorageManager();
  manager.getBookmarks();
  assert.equal(manager.hasLibraryChanges(), false);
  manager.createFolder('First');
  manager.saveManualBookmark(input);
  assert.equal(manager.hasLibraryChanges(), false);
  const writer = new StorageManager();
  writer.createFolder('External');
  manager.getBookmarks();
  manager.getFolders();
  manager.getCollections();
  manager.readLibrary();
  assert.equal(manager.hasLibraryChanges(), true);
  assert.throws(() => manager.createFolder('Stale'), /CONFLICT/);
  const fresh = new StorageManager();
  fresh.getBookmarks();
  assert.equal(fresh.hasLibraryChanges(), false);
  fresh.createFolder('Fresh');
});

test('failed writes do not advance a page baseline and a later retry can succeed', () => {
  const memory = setup();
  const manager = new StorageManager();
  manager.getBookmarks();
  memory.failWrites = true;
  assert.throws(() => manager.createFolder('Retry'));
  memory.failWrites = false;
  assert.equal(manager.hasLibraryChanges(), false);
  manager.createFolder('Retry');
  assert.equal(manager.hasLibraryChanges(), false);
});

test('changed or cleared storage is detected without parsing or mutating it', () => {
  const memory = setup();
  const manager = new StorageManager();
  manager.createFolder('Keep');
  memory.setItem(key, '{broken');
  assert.equal(manager.hasLibraryChanges(), true);
  assert.equal(memory.getItem(key), '{broken');
  memory.removeItem(key);
  assert.equal(manager.hasLibraryChanges(), true);
});

test('optional visit history does not write or block opening a bookmark from a stale page', () => {
  const memory = setup();
  const manager = new StorageManager();
  const bookmark = manager.saveManualBookmark(input);
  new StorageManager().createFolder('External');
  const before = memory.getItem(key);
  assert.doesNotThrow(() => manager.recordSiteVisit(bookmark.id));
  assert.equal(memory.getItem(key), before);
  assert.equal(memory.getItem('jipage_recent_used_v1'), null);
});

test('a stale reset cannot erase another page library or settings', () => {
  const memory = setup();
  const manager = new StorageManager();
  manager.getBookmarks();
  new StorageManager().createFolder('External');
  memory.setItem('jipage_settings_v1', '{"language":"en"}');
  const before = memory.getItem(key);
  assert.throws(() => manager.resetAllData(), /CONFLICT/);
  assert.equal(memory.getItem(key), before);
  assert.equal(memory.getItem('jipage_settings_v1'), '{"language":"en"}');
});
