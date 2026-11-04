import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageManager } from '../../src/services/storage';
import { MemoryStorage } from '../support/memory-storage';

function setup() {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  const manager = new StorageManager();
  const bookmarks = ['one', 'two'].map(title => manager.saveManualBookmark({
    title, url: `https://${title}.example/`, domain: `${title}.example`, category: '',
    order: 0, collectionIds: [], pinnedToDesktop: false,
  }));
  return { memory, manager, bookmarks };
}

test('batch desktop pin command writes once and leaves the archive untouched', () => {
  const { memory, manager, bookmarks } = setup();
  const before = manager.readLibrary();
  const set = memory.setItem.bind(memory);
  let writes = 0;
  memory.setItem = (key, value) => { writes++; set(key, value); };
  const layout = manager.setDesktopPins(bookmarks.map(item => item.id), true);
  assert.equal(writes, 1);
  assert.equal(layout.shortcuts.length, 2);
  assert.deepEqual(manager.readLibrary(), before);
  manager.setDesktopPins(bookmarks.map(item => item.id), true);
  assert.equal(writes, 1, 'Already-pinned selections do not write or duplicate shortcuts');
});

test('mixed pinned and unpinned selections can be removed in one commit and repeated safely', () => {
  const { manager, bookmarks } = setup();
  manager.setDesktopPins([bookmarks[0].id], true);
  const layout = manager.setDesktopPins(bookmarks.map(item => item.id), false);
  assert.equal(layout.shortcuts.length, 0);
  assert.equal(manager.setDesktopPins(bookmarks.map(item => item.id), false).shortcuts.length, 0);
  assert.equal(manager.getBookmarks().length, 2);
});

test('invalid references and quota failure never partially pin a batch', () => {
  const { memory, manager, bookmarks } = setup();
  const before = memory.getItem('jipage_library_v2');
  assert.throws(() => manager.setDesktopPins([bookmarks[0].id, 'missing'], true), /INVALID_REFERENCE/);
  assert.equal(memory.getItem('jipage_library_v2'), before);
  memory.failWrites = true;
  assert.throws(() => manager.setDesktopPins(bookmarks.map(item => item.id), true));
  assert.equal(memory.getItem('jipage_library_v2'), before);
});
