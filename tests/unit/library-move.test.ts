import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageManager } from '../../src/services/storage';
import { MemoryStorage } from '../support/memory-storage';

const key = 'jipage_library_v2';
function setup() {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  const manager = new StorageManager();
  const source = manager.createFolder('Source');
  const target = manager.createFolder('Target');
  const add = (title: string, folderId?: string) => manager.saveManualBookmark({
    title, url: `https://${title.toLowerCase()}.example/`, domain: `${title.toLowerCase()}.example`,
    category: '', order: 0, pinnedToDesktop: false, collectionIds: [], folderId,
  });
  const first = add('First', source.id);
  const second = add('Second', source.id);
  const kept = add('Kept', target.id);
  return { memory, manager, source, target, first, second, kept };
}

test('batch move commits bookmark destinations and ordered folder memberships exactly once', () => {
  const { memory, manager, source, target, first, second, kept } = setup();
  const original = memory.setItem.bind(memory);
  const commits: string[] = [];
  memory.setItem = (name, value) => {
    if (name === key) commits.push(value);
    original(name, value);
  };
  manager.moveBookmarks([second.id, first.id, second.id], target.id);
  assert.equal(commits.length, 1);
  const data = new StorageManager().readLibrary();
  assert.equal(data.bookmarks.find(item => item.id === first.id)?.folderId, target.id);
  assert.equal(data.bookmarks.find(item => item.id === second.id)?.folderId, target.id);
  assert.deepEqual(data.folders.find(item => item.id === source.id)?.bookmarkIds, []);
  assert.deepEqual(data.folders.find(item => item.id === target.id)?.bookmarkIds, [kept.id, second.id, first.id]);
});

test('failed batch move keeps original bytes and can be retried without duplicate memberships', () => {
  const { memory, manager, target, first } = setup();
  const before = memory.getItem(key);
  memory.failWrites = true;
  assert.throws(() => manager.moveBookmarks([first.id], target.id),
    (error: unknown) => error instanceof DOMException && error.name === 'SecurityError');
  assert.equal(memory.getItem(key), before);
  memory.failWrites = false;
  manager.moveBookmarks([first.id], target.id);
  manager.moveBookmarks([first.id], target.id);
  assert.equal(new StorageManager().getFolders().find(item => item.id === target.id)!
    .bookmarkIds.filter(id => id === first.id).length, 1);
});

test('moving to library root removes archive memberships without changing desktop or taskbar', () => {
  const { memory, manager, first, second, kept } = setup();
  manager.executeDesktop([
    { type: 'desktop.pin', bookmarkId: first.id, shortcutId: 'shortcut', to: { kind: 'root', index: 0 } },
    { type: 'desktop.pin', bookmarkId: second.id, shortcutId: 'second-shortcut', to: { kind: 'root', index: 1 } },
    { type: 'desktop.folder.create', id: 'desktop-source', name: 'Source',
      shortcutIds: ['shortcut', 'second-shortcut'], index: 0 },
    { type: 'desktop.pin', bookmarkId: kept.id, shortcutId: 'kept-shortcut', to: { kind: 'root', index: 1 } },
    { type: 'desktop.folder.create', id: 'desktop-target', name: 'Target',
      shortcutIds: ['kept-shortcut'], index: 1 },
  ]);
  manager.saveUserSettings({ dockBookmarkIds: [first.id] });
  const before = JSON.parse(memory.getItem(key)!);
  manager.moveBookmarks([first.id]);
  const after = JSON.parse(memory.getItem(key)!);
  assert.equal(after.bookmarks.find((item: { id: string }) => item.id === first.id).folderId, undefined);
  assert.ok(after.folders.every((folder: { bookmarkIds: string[] }) => !folder.bookmarkIds.includes(first.id)));
  assert.deepEqual(after.desktopLayout, before.desktopLayout);
  assert.deepEqual(after.dockBookmarkIds, before.dockBookmarkIds);
});

test('invalid move references and stale pages fail before any write', () => {
  const { memory, manager, target, first } = setup();
  const before = memory.getItem(key);
  assert.throws(() => manager.moveBookmarks([first.id], 'missing'), /INVALID_REFERENCE/);
  assert.throws(() => manager.moveBookmarks(['missing'], target.id), /INVALID_REFERENCE/);
  assert.equal(memory.getItem(key), before);
  const stale = new StorageManager();
  stale.getBookmarks();
  stale.getFolders();
  manager.createFolder('Other');
  const latest = memory.getItem(key);
  assert.throws(() => stale.moveBookmarks([first.id], target.id), /CONFLICT/);
  assert.equal(memory.getItem(key), latest);
});

test('an uncertain move commit reports uncertainty instead of claiming rollback', () => {
  const { memory, manager, target, first } = setup();
  const original = memory.setItem.bind(memory);
  memory.setItem = (name, value) => {
    original(name, value);
    if (name === key) original(name, `${value} `);
  };
  assert.throws(() => manager.moveBookmarks([first.id], target.id), /COMMIT_UNCERTAIN/);
});

test('move write succeeds but verification read fails: persisted data is reported as uncertain', () => {
  const { memory, manager, target, first } = setup();
  const set = memory.setItem.bind(memory);
  const get = memory.getItem.bind(memory);
  let rejectNextRead = false;
  memory.setItem = (name, value) => { set(name, value); rejectNextRead = true; };
  memory.getItem = name => {
    if (rejectNextRead) {
      rejectNextRead = false;
      throw new DOMException('Verification blocked', 'SecurityError');
    }
    return get(name);
  };
  assert.throws(() => manager.moveBookmarks([first.id], target.id), /COMMIT_UNCERTAIN/);
  assert.equal(JSON.parse(get(key)!).bookmarks.find((item: { id: string }) => item.id === first.id).folderId, target.id);
});
