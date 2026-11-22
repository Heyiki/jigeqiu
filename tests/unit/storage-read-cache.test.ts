import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageManager } from '../../src/services/storage';
import { configureApplicationStorage } from '../../src/services/application-storage';
import { MemoryStorage } from '../support/memory-storage';

const key = 'jipage_library_v2';
const input = {
  title: 'Saved', url: 'https://saved.example/', domain: 'saved.example',
  category: '', pinnedToDesktop: false, order: 0, collectionIds: [],
};
function setup() {
  configureApplicationStorage(undefined);
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  new StorageManager().saveManualBookmark(input);
  return memory;
}

test('a workbench snapshot parses the shared library envelope only once', () => {
  const memory = setup();
  const raw = memory.getItem(key);
  const parse = JSON.parse;
  let envelopeReads = 0;
  JSON.parse = (...args: Parameters<typeof JSON.parse>) => {
    if (args[0] === raw) envelopeReads++;
    return parse(...args);
  };
  try {
    const snapshot = new StorageManager().acceptLibrarySnapshot();
    assert.equal(snapshot.bookmarks[0].title, 'Saved');
    assert.equal(envelopeReads, 1, 'one validated parse serves every getter in the snapshot');
  } finally { JSON.parse = parse; }
});

test('startup snapshots are independent and never retain caller mutations', () => {
  setup();
  const manager = new StorageManager();
  const first = manager.readWorkbenchSnapshot();
  first.bookmarks[0].title = 'Unsaved caller edit';
  first.bookmarks[0].collectionIds.push('unsaved');
  first.settings.dockBookmarkIds?.push('unsaved');
  first.desktopLayout.root.push({ kind: 'shortcut', id: 'unsaved' });
  const second = manager.readWorkbenchSnapshot();
  assert.equal(second.bookmarks[0].title, 'Saved');
  assert.deepEqual(second.bookmarks[0].collectionIds, []);
  assert.ok(!second.settings.dockBookmarkIds?.includes('unsaved'));
  assert.deepEqual(second.desktopLayout.root, []);
  assert.notEqual(second.bookmarks, first.bookmarks);
});

test('later snapshots observe external bytes and preserve stale edit baselines', () => {
  const memory = setup();
  const manager = new StorageManager();
  manager.readWorkbenchSnapshot();
  const writer = new StorageManager();
  writer.createFolder('External');
  assert.equal(manager.readWorkbenchSnapshot().folders[0].name, 'External');
  assert.throws(() => manager.createFolder('Stale edit'), /CONFLICT/);
  const before = memory.getItem(key);
  memory.setItem(key, '{broken');
  assert.throws(() => manager.readWorkbenchSnapshot(), /CORRUPT_DATA/);
  memory.setItem(key, before!);
  assert.equal(manager.readWorkbenchSnapshot().folders[0].name, 'External');
});

test('snapshots do not survive a storage driver switch or failed transaction', async () => {
  const memory = setup();
  const manager = new StorageManager();
  manager.readWorkbenchSnapshot();
  const other = new MemoryStorage();
  other.setItem(key, JSON.stringify({ version: 1, bookmarks: [], folders: [] }));
  configureApplicationStorage({ storage: other, async mutate(action) { return action(); } });
  try {
    assert.deepEqual(manager.readWorkbenchSnapshot().bookmarks, []);
  } finally { configureApplicationStorage(undefined); }
  assert.equal(manager.readWorkbenchSnapshot().bookmarks[0].title, 'Saved');
  memory.failWrites = true;
  await assert.rejects(manager.mutate(() => manager.createFolder('Rejected')));
  memory.failWrites = false;
  assert.deepEqual(manager.readWorkbenchSnapshot().folders, []);
  assert.doesNotThrow(() => manager.createFolder('Retry'));
  assert.equal(manager.readWorkbenchSnapshot().folders[0].name, 'Retry');
});
