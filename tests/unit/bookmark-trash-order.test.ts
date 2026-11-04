import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageManager } from '../../src/services/storage';
import { readBookmarkTrash } from '../../src/services/bookmark-trash';
import { MemoryStorage } from '../support/memory-storage';

const key = 'jipage_library_v2';
function setup() {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  const manager = new StorageManager();
  const left = manager.createFolder('Left');
  const right = manager.createFolder('Right');
  const bookmarks = 'abcdefghi'.split('').map((title, index) => manager.saveManualBookmark({
    title, url: `https://${title}.example/`, domain: `${title}.example`, category: '',
    folderId: index < 6 ? index % 2 === 0 ? left.id : right.id : undefined,
    collectionIds: [], pinnedToDesktop: false, order: 0,
  }));
  const original = manager.readLibrary();
  const ids = (titles: string) => [...titles].map(title => bookmarks.find(item => item.title === title)!.id);
  const entry = (title: string) => new StorageManager().getBookmarkTrash().find(item => item.bookmark.title === title)!;
  function expectOrder(missing: string) {
    const selected = new Set(ids(missing));
    const fresh = new StorageManager();
    assert.deepEqual(fresh.getBookmarks().map(item => item.id),
      original.bookmarks.filter(item => !selected.has(item.id)).map(item => item.id));
    assert.deepEqual(fresh.getFolders().map(folder => folder.bookmarkIds),
      original.folders.map(folder => folder.bookmarkIds.filter(id => !selected.has(id))));
  }
  return { memory, manager, original, ids, entry, expectOrder };
}

for (const [selected, restore] of [
  ['ab', 'ba'], ['ace', 'eca'], ['ace', 'cea'], ['abefgi', 'ifebga'],
]) {
  test(`batch ${selected} restores in order ${restore}, including after each refresh`, () => {
    const { manager, ids, entry, expectOrder } = setup();
    manager.deleteBookmarks(ids(selected));
    let missing = selected;
    for (const title of restore) {
      new StorageManager().restoreTrashedBookmark(entry(title).id);
      missing = missing.replace(title, '');
      expectOrder(missing);
    }
    assert.deepEqual(new StorageManager().getBookmarkTrash(), []);
  });
}

test('new batches have distinct UUIDs while every record in one batch shares its ID', () => {
  const { manager, ids } = setup();
  const now = Date.now;
  try {
    Date.now = () => 1234567890;
    manager.deleteBookmarks(ids('ac'));
    manager.deleteBookmarks(ids('b'));
  } finally {
    Date.now = now;
  }
  const entries = manager.getBookmarkTrash();
  const first = entries.filter(item => item.bookmark.title !== 'b');
  assert.match(first[0].batchId!, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(first[0].batchId, first[1].batchId);
  assert.notEqual(first[0].batchId, entries.find(item => item.bookmark.title === 'b')!.batchId);
  assert.ok(entries.every(item => item.deletedAt === 1234567890));
});

for (const [selected, purge, restore] of [
  ['abcef', 'a', 'fecb'],
  ['ace', 'ac', 'e'],
  ['ghi', 'g', 'ih'],
  ['ace', 'e', 'ca'],
]) {
  test(`purging ${purge} from ${selected} keeps remaining indices correct for restore ${restore}`, () => {
    const { memory, manager, ids, entry, expectOrder, original } = setup();
    manager.deleteBookmarks(ids(selected));
    const write = memory.setItem.bind(memory);
    let writes = 0;
    memory.setItem = (name, value) => { writes++; write(name, value); };
    let purged = '';
    for (const title of purge) {
      new StorageManager().purgeTrashedBookmark(entry(title).id);
      purged += title;
      const purgedBookmarks = original.bookmarks.filter(item => purged.includes(item.title));
      for (const remaining of new StorageManager().getBookmarkTrash()) {
        const index = original.bookmarks.findIndex(item => item.id === remaining.bookmark.id);
        assert.equal(remaining.bookmarkIndex, index - purgedBookmarks.filter(item =>
          original.bookmarks.indexOf(item) < index).length);
        const folder = original.folders.find(item => item.id === remaining.bookmark.folderId);
        const folderIndex = folder?.bookmarkIds.indexOf(remaining.bookmark.id) ?? 0;
        assert.equal(remaining.folderIndex, folderIndex - purgedBookmarks.filter(item =>
          folder && item.folderId === folder.id && folder.bookmarkIds.indexOf(item.id) < folderIndex).length);
      }
    }
    let missing = selected;
    for (const title of restore) {
      new StorageManager().restoreTrashedBookmark(entry(title).id);
      missing = missing.replace(title, '');
      expectOrder(missing);
    }
    assert.equal(writes, purge.length + restore.length, 'one envelope write per purge or restore');
  });
}

for (const action of ['restore', 'purge'] as const) {
  test(`${action} quota failure preserves all batch indices and retries atomically`, () => {
    const { memory, manager, ids, entry, expectOrder } = setup();
    manager.deleteBookmarks(ids('ace'));
    const target = entry(action === 'restore' ? 'e' : 'a');
    const before = memory.getItem(key);
    const write = memory.setItem.bind(memory);
    memory.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    const run = () => {
      const fresh = new StorageManager();
      if (action === 'restore') fresh.restoreTrashedBookmark(target.id);
      else fresh.purgeTrashedBookmark(target.id);
    };
    assert.throws(run, (cause: unknown) => cause instanceof DOMException && cause.name === 'QuotaExceededError');
    assert.equal(memory.getItem(key), before);
    memory.setItem = write;
    run();
    for (const title of action === 'restore' ? 'ca' : 'ec') {
      new StorageManager().restoreTrashedBookmark(entry(title).id);
    }
    expectOrder(action === 'restore' ? '' : 'a');
  });
}

test('legacy records without batch IDs retain their existing restoration and purge semantics', () => {
  const { memory, manager, ids } = setup();
  manager.deleteBookmarks(ids('ac'));
  const data = JSON.parse(memory.getItem(key)!);
  for (const entry of data.bookmarkTrash) delete entry.batchId;
  delete data.bookmarkTrash[1].bookmarkIndex;
  memory.setItem(key, JSON.stringify(data));
  const legacy = new StorageManager().getBookmarkTrash();
  assert.equal(legacy[0].batchId, undefined);
  new StorageManager().purgeTrashedBookmark(legacy[0].id);
  assert.deepEqual(new StorageManager().getBookmarkTrash(), [legacy[1]]);
  new StorageManager().restoreTrashedBookmark(legacy[1].id);
  assert.equal(new StorageManager().getBookmarks().at(-1)!.title, 'c');
});

test('purging one batch never rebases a different batch', () => {
  const { manager, ids } = setup();
  manager.deleteBookmarks(ids('a'));
  manager.deleteBookmarks(ids('ce'));
  const before = manager.getBookmarkTrash();
  manager.purgeTrashedBookmark(before.find(item => item.bookmark.title === 'a')!.id);
  assert.deepEqual(manager.getBookmarkTrash(), before.filter(item => item.bookmark.title !== 'a'));
});

test('batch metadata is optional but malformed IDs refuse reading without discarding trash', () => {
  const { manager, ids } = setup();
  manager.deleteBookmarks(ids('a'));
  const entry = manager.getBookmarkTrash()[0];
  for (const batchId of ['', 3, null, {}]) {
    assert.throws(() => readBookmarkTrash([{ ...entry, batchId }]), /CORRUPT_DATA/);
  }
  const { batchId: _batchId, ...legacy } = entry;
  assert.deepEqual(readBookmarkTrash([legacy]), [legacy]);
});

test('all 48 restore/purge combinations and orders preserve a non-contiguous cross-folder/root batch', () => {
  for (const order of ['acg', 'agc', 'cag', 'cga', 'gac', 'gca']) {
    for (let mask = 0; mask < 8; mask++) {
      const { manager, ids, entry, expectOrder } = setup();
      manager.deleteBookmarks(ids('acg'));
      let missing = 'acg';
      for (const [index, title] of [...order].entries()) {
        const fresh = new StorageManager();
        if (mask & (1 << index)) {
          fresh.purgeTrashedBookmark(entry(title).id);
        } else {
          fresh.restoreTrashedBookmark(entry(title).id);
          missing = missing.replace(title, '');
        }
        expectOrder(missing);
      }
      assert.deepEqual(new StorageManager().getBookmarkTrash(), []);
    }
  }
});

test('quota failure creating a batch preserves the original envelope with no partial trash', () => {
  const { manager, memory, ids, expectOrder } = setup();
  const before = memory.getItem(key);
  const write = memory.setItem.bind(memory);
  memory.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  assert.throws(() => manager.deleteBookmarks(ids('ace')),
    (cause: unknown) => cause instanceof DOMException && cause.name === 'QuotaExceededError');
  assert.equal(memory.getItem(key), before);
  expectOrder('');
  memory.setItem = write;
  manager.deleteBookmarks(ids('ace'));
  assert.equal(new StorageManager().getBookmarkTrash().length, 3);
});

for (const action of ['restore', 'purge'] as const) {
  test(`${action} readback uncertainty retains the one committed envelope without rollback or retry`, () => {
    const { memory, manager, ids, entry, expectOrder } = setup();
    manager.deleteBookmarks(ids('ace'));
    const target = entry(action === 'restore' ? 'e' : 'a');
    const write = memory.setItem.bind(memory);
    let writes = 0;
    memory.setItem = (name, value) => { writes++; write(name, `${value} `); };
    assert.throws(() => {
      if (action === 'restore') manager.restoreTrashedBookmark(target.id);
      else manager.purgeTrashedBookmark(target.id);
    }, /COMMIT_UNCERTAIN/);
    assert.equal(writes, 1);
    memory.setItem = write;
    assert.equal(new StorageManager().getBookmarkTrash().length, 2);
    for (const title of action === 'restore' ? 'ca' : 'ec') {
      new StorageManager().restoreTrashedBookmark(entry(title).id);
    }
    expectOrder(action === 'restore' ? '' : 'a');
  });
}
