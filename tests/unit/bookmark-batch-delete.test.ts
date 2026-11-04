import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageManager } from '../../src/services/storage';
import { MemoryStorage } from '../support/memory-storage';

const key = 'jipage_library_v2';
function setup() {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  const manager = new StorageManager();
  const folder = manager.createFolder('Work');
  const add = (title: string) => manager.saveManualBookmark({
    title, url: `https://${title}.example/`, domain: `${title}.example`, category: '',
    folderId: folder.id, collectionIds: [], pinnedToDesktop: false, order: 0, keywords: ['keep'],
  });
  const first = add('first');
  const second = add('second');
  const kept = add('kept');
  manager.saveFolders(manager.getFolders().map(item => ({ ...item, pinnedToDesktop: false })));
  manager.executeDesktop([first, second, kept].map((bookmark, index) => ({
    type: 'desktop.pin' as const, bookmarkId: bookmark.id, shortcutId: `shortcut-${bookmark.title}`,
    to: { kind: 'root' as const, index },
  })));
  manager.saveUserSettings({ dockBookmarkIds: [first.id, second.id, kept.id] });
  return { memory, manager, folder, first, second, kept };
}

test('batch delete persists assets, trash, archive and shortcuts once, with one restorable entry per bookmark', () => {
  const { memory, manager, folder, first, second, kept } = setup();
  const original = memory.setItem.bind(memory);
  let writes = 0;
  memory.setItem = (name, value) => { if (name === key) writes++; original(name, value); };
  const deleted = manager.deleteBookmarks([first.id, second.id, first.id]);
  assert.deepEqual(deleted.map(item => item.id), [first.id, second.id]);
  assert.equal(writes, 1);
  const fresh = new StorageManager();
  assert.deepEqual(fresh.getBookmarks().map(item => item.id), [kept.id]);
  assert.deepEqual(fresh.getFolders().find(item => item.id === folder.id)!.bookmarkIds, [kept.id]);
  assert.deepEqual(fresh.getDesktopLayout()!.shortcuts.map(item => item.bookmarkId), [kept.id]);
  assert.deepEqual(fresh.getUserSettings().dockBookmarkIds, [kept.id]);
  const trash = fresh.getBookmarkTrash();
  assert.equal(trash.length, 2);
  assert.deepEqual(trash.map(item => item.bookmark.id), [first.id, second.id]);
  assert.deepEqual(trash.map(item => item.folderIndex), [0, 1]);
  assert.deepEqual(trash.map(item => item.bookmarkIndex), [0, 1]);
  for (const entry of trash) fresh.restoreTrashedBookmark(entry.id);
  assert.deepEqual(fresh.getBookmarks().map(item => item.id), [first.id, second.id, kept.id]);
  assert.ok(fresh.getBookmarks().every(item => item.keywords?.includes('keep')));
  assert.deepEqual(fresh.getUserSettings().dockBookmarkIds, [kept.id]);
});

test('quota failure leaves the entire selected batch unchanged and retry never duplicates trash entries', () => {
  const { memory, manager, first, second } = setup();
  const before = memory.getItem(key);
  memory.failWrites = true;
  assert.throws(() => manager.deleteBookmarks([first.id, second.id]),
    (error: unknown) => error instanceof DOMException && error.name === 'SecurityError');
  assert.equal(memory.getItem(key), before);
  memory.failWrites = false;
  manager.deleteBookmarks([first.id, second.id]);
  assert.equal(new StorageManager().getBookmarkTrash().length, 2);
});

test('missing selected bookmark or stale page rejects before any batch member is deleted', () => {
  const { memory, manager, first, second } = setup();
  const before = memory.getItem(key);
  assert.throws(() => manager.deleteBookmarks([first.id, 'missing']), /INVALID_REFERENCE/);
  assert.equal(memory.getItem(key), before);
  const stale = new StorageManager();
  stale.getBookmarks();
  manager.createFolder('Other');
  const current = memory.getItem(key);
  assert.throws(() => stale.deleteBookmarks([first.id, second.id]), /CONFLICT/);
  assert.equal(memory.getItem(key), current);
});

test('empty batch is a no-op and single delete retains its missing-item compatibility', () => {
  const { memory, manager } = setup();
  const before = memory.getItem(key);
  assert.deepEqual(manager.deleteBookmarks([]), []);
  assert.equal(manager.deleteBookmark('missing'), null);
  assert.equal(memory.getItem(key), before);
});

test('batch write verification failure reports uncertain and never tries destructive rollback', () => {
  const { memory, manager, first, second } = setup();
  const original = memory.setItem.bind(memory);
  let writes = 0;
  memory.setItem = (name, value) => {
    writes++;
    original(name, `${value} `);
  };
  assert.throws(() => manager.deleteBookmarks([first.id, second.id]), /COMMIT_UNCERTAIN/);
  assert.equal(writes, 1);
  const persisted = JSON.parse(memory.getItem(key)!);
  assert.equal(persisted.bookmarkTrash.length, 2);
  assert.equal(persisted.bookmarks.length, 1);
});
