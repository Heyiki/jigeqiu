import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AssetAction } from '../../src/domain/assets/commands';
import type { Bookmark, Folder } from '../../src/types';
import { StorageManager } from '../../src/services/storage';
import { MemoryStorage } from '../support/memory-storage';

const key = 'jipage_library_v2';
const legacyBookmarks = 'jipage_bookmarks_v1';
const legacyFolders = 'jipage_folders_v1';
function bookmark(id: string, folderId?: string): Bookmark {
  return {
    id, title: id, url: `https://example.test/${id}`, domain: 'example.test',
    category: 'keep-category', tags: ['keep-tag'], notes: 'private', keywords: ['find'],
    ...(folderId === undefined ? {} : { folderId }), pinnedToDesktop: true, order: 4, collectionIds: ['keep-collection'],
    createdAt: 1, updatedAt: 2,
  };
}
function fixture() {
  const bookmarks = [bookmark('b1', 'f1'), bookmark('b2', 'f2'), bookmark('b3')];
  const folders: Folder[] = [
    { id: 'f1', name: 'Outer', bookmarkIds: ['b1'], pinnedToDesktop: true, order: 0, createdAt: 1, updatedAt: 2 },
    { id: 'f2', name: 'Nested', parentId: 'f1', bookmarkIds: ['b2'], pinnedToDesktop: true, order: 1, createdAt: 1, updatedAt: 2 },
  ];
  return { bookmarks, folders };
}
function setup(combined = false) {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  const library = fixture();
  memory.setItem(legacyBookmarks, JSON.stringify(library.bookmarks));
  memory.setItem(legacyFolders, JSON.stringify(library.folders));
  if (combined) memory.setItem(key, JSON.stringify({ version: 1, ...library, custom: { keep: true } }));
  const store = new StorageManager();
  return { memory, store, library };
}
function raw(memory: MemoryStorage) {
  return Array.from({ length: memory.length }, (_, index) => memory.key(index)!)
    .sort().map(name => [name, memory.getItem(name)]);
}
function arrays(store: StorageManager) { return JSON.stringify(store.readLibrary()); }
function withDesktop() {
  const result = setup(true);
  result.store.executeDesktop([
    { type: 'desktop.pin', bookmarkId: 'b1', shortcutId: 's1', to: { kind: 'root', index: 0 } },
    { type: 'desktop.pin', bookmarkId: 'b2', shortcutId: 's2', to: { kind: 'root', index: 1 } },
    { type: 'desktop.folder.create', id: 'outer-group', name: 'Outer', shortcutIds: ['s1', 's2'], index: 0 },
    { type: 'desktop.pin', bookmarkId: 'b3', shortcutId: 's3', to: { kind: 'root', index: 1 } },
  ]);
  return result;
}

test('new users read a fresh empty layout without creating asset or layout keys', () => {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  const store = new StorageManager();
  const first = store.getDesktopLayout();
  const second = store.getDesktopLayout();
  assert.deepEqual(first, { shortcuts: [], folders: [], root: [], dock: [] });
  assert.deepEqual(second, first);
  assert.notEqual(first, second);
  store.getDesktopLayout().folders.push({ id: 'detached', name: 'Detached', shortcutIds: [] });
  assert.deepEqual(store.getDesktopLayout(), { shortcuts: [], folders: [], root: [], dock: [] });
  assert.deepEqual(store.readLibrary(), { bookmarks: [], folders: [] });
  assert.deepEqual(raw(memory), []);
});

test('first desktop folder creation commits layout and operation once without seeding assets', () => {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  const store = new StorageManager();
  const writes: string[] = [];
  const set = memory.setItem.bind(memory);
  memory.setItem = (name, value) => { writes.push(name); set(name, value); };
  const layout = store.executeDesktop([
    { type: 'desktop.folder.create', id: 'first-group', name: 'First', shortcutIds: [], index: 0 },
  ]);
  assert.deepEqual(writes, [key]);
  assert.deepEqual(layout, {
    shortcuts: [], folders: [{ id: 'first-group', name: 'First', shortcutIds: [] }],
    root: [{ kind: 'desktop-folder', id: 'first-group' }], dock: [],
  });
  assert.deepEqual(JSON.parse(memory.getItem(key)!).desktopLayout, layout);
  assert.deepEqual(new StorageManager().readLibrary(), { bookmarks: [], folders: [] });
});

test('first manual bookmark and shortcut are published in one core commit', () => {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  const store = new StorageManager();
  const writes: string[] = [];
  const set = memory.setItem.bind(memory);
  memory.setItem = (name, value) => { writes.push(name); set(name, value); };
  const created = store.saveManualBookmark(bookmark('first'));
  assert.deepEqual(writes, [key]);
  const saved = JSON.parse(memory.getItem(key)!);
  assert.deepEqual(saved.bookmarks, JSON.parse(JSON.stringify([created])));
  assert.deepEqual(saved.folders, []);
  assert.equal(created.pinnedToDesktop, false);
  assert.equal(saved.desktopLayout.shortcuts.length, 1);
  assert.equal(saved.desktopLayout.shortcuts[0].bookmarkId, created.id);
  assert.deepEqual(saved.desktopLayout.root, [{ kind: 'shortcut', id: saved.desktopLayout.shortcuts[0].id }]);
  assert.deepEqual(new StorageManager().getDesktopLayout(), saved.desktopLayout);
});

test('missing layouts ignore legacy pin flags and leave all library arrays and stored keys untouched', () => {
  for (const combined of [false, true]) {
    const { memory, store, library } = setup(combined);
    const before = raw(memory);
    assert.deepEqual(store.getDesktopLayout(), { shortcuts: [], folders: [], root: [], dock: [] });
    assert.deepEqual(store.readLibrary(), library);
    assert.deepEqual(Object.keys(store.readLibrary()).sort(), ['bookmarks', 'folders']);
    assert.deepEqual(raw(memory), before);
  }
});

test('first explicit pin persists only the requested shortcut and preserves asset fields and old keys', () => {
  for (const combined of [false, true]) {
    const { memory, store, library } = setup(combined);
    const oldBookmarks = memory.getItem(legacyBookmarks);
    const oldFolders = memory.getItem(legacyFolders);
    const writes: string[] = [];
    const set = memory.setItem.bind(memory);
    memory.setItem = (name, value) => { writes.push(name); set(name, value); };
    const layout = store.executeDesktop([
      { type: 'desktop.pin', bookmarkId: 'b2', shortcutId: 'first-pin', to: { kind: 'root', index: 0 } },
    ]);
    assert.deepEqual(writes, [key]);
    assert.deepEqual(layout, {
      shortcuts: [{ id: 'first-pin', bookmarkId: 'b2' }], folders: [],
      root: [{ kind: 'shortcut', id: 'first-pin' }], dock: [],
    });
    assert.deepEqual(store.readLibrary(), library);
    assert.deepEqual(JSON.parse(memory.getItem(key)!).desktopLayout, layout);
    assert.equal(memory.getItem(legacyBookmarks), oldBookmarks);
    assert.equal(memory.getItem(legacyFolders), oldFolders);
    if (combined) assert.deepEqual(JSON.parse(memory.getItem(key)!).custom, { keep: true });
  }
});

test('first desktop write rejects library, layout and retained legacy key conflicts without overwriting', () => {
  for (const field of ['bookmarks', 'desktopLayout', 'legacyFolders']) {
    const { store, memory } = setup(true);
    store.getDesktopLayout();
    if (field === 'legacyFolders') memory.setItem(legacyFolders, '[]');
    else {
      const changed = JSON.parse(memory.getItem(key)!);
      if (field === 'bookmarks') changed.bookmarks[0].notes = 'external';
      else changed.desktopLayout = { shortcuts: [], folders: [], root: [], dock: [] };
      memory.setItem(key, JSON.stringify(changed));
    }
    const before = raw(memory);
    assert.throws(() => store.executeDesktop([
      { type: 'desktop.folder.create', id: 'first-group', name: 'First', shortcutIds: [], index: 0 },
    ]), /CONFLICT/);
    assert.deepEqual(raw(memory), before);
  }
});

test('first desktop and manual writes preserve all keys on failure and can retry once', () => {
  for (const manual of [false, true]) {
    const { store, memory } = setup(true);
    const operation = manual ? () => store.saveManualBookmark(bookmark('first'))
      : () => store.executeDesktop([
        { type: 'desktop.folder.create', id: 'first-group', name: 'First', shortcutIds: [], index: 0 },
      ]);
    const before = raw(memory);
    memory.failWrites = true;
    assert.throws(operation, { name: 'SecurityError' });
    memory.failWrites = false;
    assert.deepEqual(raw(memory), before);
    assert.deepEqual(store.getDesktopLayout(), { shortcuts: [], folders: [], root: [], dock: [] });
    operation();
    const layout = new StorageManager().getDesktopLayout()!;
    assert.equal(layout.folders.length, manual ? 0 : 1);
    assert.equal(layout.shortcuts.length, manual ? 1 : 0);
  }
});

test('first write verification failures report uncertain without rollback or duplicate retries', () => {
  for (const manual of [false, true]) {
    for (const failure of ['changed-bytes', 'blocked-read']) {
      const { store, memory, library } = setup(true);
      store.getDesktopLayout();
      const set = memory.setItem.bind(memory);
      const get = memory.getItem.bind(memory);
      let writes = 0;
      let rejectRead = false;
      memory.setItem = (name, value) => {
        writes++;
        set(name, failure === 'changed-bytes' ? `${value} ` : value);
        rejectRead = failure === 'blocked-read';
      };
      memory.getItem = name => {
        if (rejectRead) {
          rejectRead = false;
          throw new DOMException('Verification blocked', 'SecurityError');
        }
        return get(name);
      };
      const operation = manual ? () => store.saveManualBookmark(bookmark('first'))
        : () => store.executeDesktop([
          { type: 'desktop.folder.create', id: 'first-group', name: 'First', shortcutIds: [], index: 0 },
        ]);
      assert.throws(operation, /COMMIT_UNCERTAIN/);
      assert.equal(writes, 1);
      const persisted = JSON.parse(get(key)!);
      assert.equal(persisted.bookmarks.length, library.bookmarks.length + (manual ? 1 : 0));
      assert.equal(persisted.desktopLayout.shortcuts.length, manual ? 1 : 0);
      assert.equal(persisted.desktopLayout.folders.length, manual ? 0 : 1);
      assert.throws(operation, manual ? /DUPLICATE/ : /CONFLICT/);
      assert.throws(() => manual ? store.saveManualBookmark(bookmark('after-uncertain'))
        : store.executeDesktop([
          { type: 'desktop.folder.create', id: 'after-uncertain', name: 'Blocked', shortcutIds: [], index: 0 },
        ]), /CONFLICT/);
      assert.equal(writes, 1);
    }
  }
});

test('corrupt active layout throws on reads, desktop commands and library saves without resetting data', () => {
  for (const bad of [null, {}, { shortcuts: [], folders: [], root: [{ kind: 'shortcut', id: 'lost' }], dock: [] }]) {
    const { store, memory } = setup(true);
    const entry = JSON.parse(memory.getItem(key)!);
    entry.desktopLayout = bad;
    memory.setItem(key, JSON.stringify(entry));
    const before = raw(memory);
    assert.throws(() => store.getDesktopLayout(), /CORRUPT_DATA/);
    assert.throws(() => store.executeDesktop([
      { type: 'desktop.folder.create', id: 'new-group', name: 'New', shortcutIds: [], index: 0 },
    ]), /CORRUPT_DATA/);
    assert.throws(() => store.saveManualBookmark(bookmark('first')), /CORRUPT_DATA/);
    assert.throws(() => store.saveBookmarks(fixture().bookmarks), /CORRUPT_DATA/);
    assert.deepEqual(raw(memory), before);
  }
});

test('importing assets without a layout never derives shortcuts from old or injected pin data', () => {
  const { store, memory, library } = setup();
  const current = store.readLibrary();
  const next = { ...library, bookmarks: [...library.bookmarks, bookmark('imported')],
    desktopLayout: { shortcuts: [{ id: 'injected', bookmarkId: 'imported' }], folders: [],
      root: [{ kind: 'shortcut', id: 'injected' }], dock: [] } };
  store.commitImportedLibrary(current, next);
  assert.deepEqual(store.getDesktopLayout(), { shortcuts: [], folders: [], root: [], dock: [] });
  assert.deepEqual(store.readLibrary(), { bookmarks: next.bookmarks, folders: next.folders });
  assert.equal(memory.getItem(legacyBookmarks), JSON.stringify(library.bookmarks));
  assert.equal(memory.getItem(legacyFolders), JSON.stringify(library.folders));
});

test('all desktop action variants leave bookmark and folder arrays byte-equal', () => {
  const { store, memory } = withDesktop();
  const before = arrays(store);
  const layout = store.getDesktopLayout()!;
  const outer = layout.folders[0].id;
  const b1 = layout.shortcuts.find(item => item.bookmarkId === 'b1')!.id;
  const actions: Extract<AssetAction, { type: `desktop.${string}` }>[] = [
    { type: 'desktop.folder.rename', id: outer, name: 'Desktop only' },
    { type: 'desktop.move', ref: { kind: 'shortcut', id: b1 }, to: { kind: 'root', index: 0 } },
    { type: 'desktop.folder.create', id: 'group-new', name: 'New', shortcutIds: [b1], index: 0 },
    { type: 'desktop.move', ref: { kind: 'desktop-folder', id: 'group-new' }, to: { kind: 'root', index: 2 } },
    { type: 'desktop.folder.remove', id: 'group-new', mode: 'dissolve' },
    { type: 'desktop.unpin', bookmarkId: 'b1' },
    { type: 'desktop.pin', bookmarkId: 'b1', shortcutId: 'shortcut-new', to: { kind: 'folder', folderId: outer, index: 0 } },
    { type: 'desktop.folder.remove', id: outer, mode: 'remove-shortcuts' },
  ];
  for (const action of actions) {
    store.executeDesktop([action]);
    assert.equal(arrays(store), before, action.type);
  }
  assert.deepEqual(JSON.parse(memory.getItem(key)!).custom, { keep: true });
});

test('invalid references, ID collisions, nesting and later batch failure cause no writes', () => {
  const { store, memory } = withDesktop();
  const layout = store.getDesktopLayout()!;
  const group = layout.folders[0].id;
  const bad: unknown[][] = [
    [{ type: 'desktop.pin', bookmarkId: 'missing', shortcutId: 's-new', to: { kind: 'root', index: 0 } }],
    [{ type: 'desktop.folder.create', id: 'b1', name: 'collision', shortcutIds: [], index: 0 }],
    [{ type: 'desktop.move', ref: { kind: 'desktop-folder', id: group }, to: { kind: 'folder', folderId: group, index: 0 } }],
    [{ type: 'desktop.folder.rename', id: group, name: 'intermediate' }, { type: 'desktop.folder.rename', id: 'missing', name: 'bad' }],
    [{ type: 'library.folder.rename', id: 'f1', name: 'not desktop' }],
  ];
  for (const actions of bad) {
    const before = raw(memory);
    assert.throws(() => store.executeDesktop(actions as Parameters<StorageManager['executeDesktop']>[0]));
    assert.deepEqual(raw(memory), before);
  }
});

test('layout writer detects another writer changing the library or the layout', () => {
  for (const field of ['bookmarks', 'layout']) {
    const { store, memory } = withDesktop();
    store.getDesktopLayout();
    const external = JSON.parse(memory.getItem(key)!);
    if (field === 'bookmarks') external.bookmarks[0].title = 'external';
    else external.desktopLayout.folders[0].name = 'external';
    memory.setItem(key, JSON.stringify(external));
    const before = raw(memory);
    assert.throws(() => store.executeDesktop([{ type: 'desktop.unpin', bookmarkId: 'b1' }]), /CONFLICT/);
    assert.deepEqual(raw(memory), before);
  }
});

test('library imports preserve active layout, reject stale layout snapshots and ignore injected layout', () => {
  const { store, memory } = withDesktop();
  const current = store.readLibrary();
  const before = store.getDesktopLayout();
  store.commitImportedLibrary(current, { ...current, desktopLayout: {} } as typeof current);
  assert.deepEqual(store.getDesktopLayout(), before);
  const expected = store.readLibrary();
  const other = new StorageManager();
  other.getDesktopLayout();
  other.executeDesktop([{ type: 'desktop.unpin', bookmarkId: 'b1' }]);
  const rawBefore = raw(memory);
  assert.throws(() => store.commitImportedLibrary(expected, expected), /CONFLICT/);
  assert.deepEqual(raw(memory), rawBefore);
});

test('bookmark saves and deletes prune only removed IDs, not flags, and preserve remaining positions', () => {
  const { store, memory } = withDesktop();
  const before = store.getDesktopLayout()!;
  const keep = before.shortcuts.filter(item => item.bookmarkId !== 'b1');
  const next = store.getBookmarks().filter(item => item.id !== 'b1').map(item => ({ ...item, pinnedToDesktop: false }));
  store.saveBookmarks(next);
  const layout = store.getDesktopLayout()!;
  assert.deepEqual(layout.shortcuts, keep);
  assert.equal(layout.folders.length, before.folders.length);
  store.getFolders();
  store.deleteBookmark('b2');
  assert.deepEqual(store.getDesktopLayout()!.shortcuts.map(item => item.bookmarkId), ['b3']);
  store.restoreBookmark(fixture().bookmarks[0]);
  assert.deepEqual(store.getDesktopLayout()!.shortcuts.map(item => item.bookmarkId), ['b3']);
  assert.deepEqual(store.getFolders()[0].bookmarkIds, ['b1']);
  assert.ok(memory.getItem(legacyBookmarks));
});

test('manual new bookmark and group shortcut commit in one write, without touching legacy asset flags', () => {
  const { store, memory } = withDesktop();
  const layout = store.getDesktopLayout()!;
  const before = store.readLibrary();
  const input = { ...bookmark('new', 'f2'), url: 'https://new.test/' };
  const created = store.saveManualBookmark(input, undefined, { folderId: layout.folders[0].id });
  assert.equal(created.pinnedToDesktop, false);
  assert.equal(created.folderId, 'f2');
  const updated = JSON.parse(memory.getItem(key)!);
  assert.deepEqual(updated.bookmarks.slice(0, 3), before.bookmarks);
  assert.deepEqual(updated.folders[0], before.folders[0]);
  assert.deepEqual(updated.folders[1].bookmarkIds, ['b2', created.id]);
  const shortcut = store.getDesktopLayout()!.shortcuts.find(item => item.bookmarkId === created.id)!;
  assert.ok(store.getDesktopLayout()!.folders[0].shortcutIds.includes(shortcut.id));
});

test('manual target default, null and existing edits preserve explicit placement semantics', () => {
  const { store } = withDesktop();
  const input = { ...bookmark('new'), url: 'https://root-new.test/' };
  const created = store.saveManualBookmark(input);
  const layout = store.getDesktopLayout()!;
  assert.ok(layout.root.some(ref => ref.kind === 'shortcut' && layout.shortcuts.some(item => item.id === ref.id && item.bookmarkId === created.id)));
  const unpinned = store.saveManualBookmark({ ...input, url: 'https://unpin-new.test/' }, undefined, null);
  assert.equal(store.getDesktopLayout()!.shortcuts.some(item => item.bookmarkId === unpinned.id), false);
  const before = store.getDesktopLayout();
  store.saveManualBookmark({ ...created, title: 'edit', pinnedToDesktop: true }, created.id, { folderId: 'missing-ignored-on-edit' });
  assert.deepEqual(store.getDesktopLayout(), before);
});

test('invalid manual targets and failed atomic saves do not leave new assets or shortcuts', () => {
  const { store, memory } = withDesktop();
  const input = { ...bookmark('new'), url: 'https://atomic-new.test/' };
  const before = raw(memory);
  assert.throws(() => store.saveManualBookmark(input, undefined, { folderId: 'missing' }));
  assert.deepEqual(raw(memory), before);
  memory.failWrites = true;
  assert.throws(() => store.saveManualBookmark(input, undefined, {}));
  memory.failWrites = false;
  assert.deepEqual(raw(memory), before);
});

test('read returns a detached layout and corrupt raw JSON is never replaced', () => {
  const { store, memory } = withDesktop();
  const layout = store.getDesktopLayout()!;
  layout.root.length = 0;
  assert.ok(store.getDesktopLayout()!.root.length);
  memory.setItem(key, '{broken');
  assert.throws(() => store.getDesktopLayout(), /CORRUPT_DATA/);
  assert.equal(memory.getItem(key), '{broken');
});

test('library folder identities cannot be reused even by a transient desktop entity in a batch', () => {
  const { store, memory } = withDesktop();
  const before = raw(memory);
  assert.throws(() => store.executeDesktop([
    { type: 'desktop.folder.create', id: 'f1', name: 'collision', shortcutIds: [], index: 0 },
    { type: 'desktop.folder.remove', id: 'f1', mode: 'dissolve' },
  ]));
  assert.deepEqual(raw(memory), before);
});

test('real quota rejection on first pin preserves the entire legacy snapshot without saving an empty layout', () => {
  const library = fixture();
  const values = [[legacyBookmarks, JSON.stringify(library.bookmarks)], [legacyFolders, JSON.stringify(library.folders)]];
  const maxBytes = values.reduce((sum, [name, value]) => sum + 2 * (name.length + value.length), 0) + 10;
  const memory = new MemoryStorage({ maxBytes });
  for (const [name, value] of values) memory.setItem(name, value);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  const store = new StorageManager();
  const before = raw(memory);
  assert.throws(() => store.executeDesktop([
    { type: 'desktop.pin', bookmarkId: 'b1', shortcutId: 'first-pin', to: { kind: 'root', index: 0 } },
  ]), { name: 'QuotaExceededError' });
  assert.deepEqual(raw(memory), before);
  assert.deepEqual(store.getDesktopLayout(), { shortcuts: [], folders: [], root: [], dock: [] });
  assert.deepEqual(raw(memory), before);
});

test('manual creation with a group shortcut publishes exactly one combined-key write', () => {
  const { store, memory } = withDesktop();
  const group = store.getDesktopLayout()!.folders[0].id;
  const writes: string[] = [];
  const set = memory.setItem.bind(memory);
  memory.setItem = (name, value) => { writes.push(name); set(name, value); };
  store.saveManualBookmark({ ...bookmark('new'), url: 'https://one-write.test/' }, undefined, { folderId: group });
  assert.deepEqual(writes, [key]);
});

test('invalid command accessors are rejected without executing getters or writing data', () => {
  const { store, memory } = withDesktop();
  let called = false;
  const action = { get type() { called = true; return 'desktop.unpin'; }, bookmarkId: 'b1' };
  const before = raw(memory);
  assert.throws(() => store.executeDesktop([action as AssetAction as Parameters<StorageManager['executeDesktop']>[0][number]]));
  assert.equal(called, false);
  assert.deepEqual(raw(memory), before);
});

test('cloned import baselines still reject an intervening layout-only writer', () => {
  const { store, memory } = withDesktop();
  const expected = structuredClone(store.readLibrary());
  const other = new StorageManager();
  other.executeDesktop([{ type: 'desktop.unpin', bookmarkId: 'b1' }]);
  const before = raw(memory);
  assert.throws(() => store.commitImportedLibrary(expected, expected), /CONFLICT/);
  assert.deepEqual(raw(memory), before);
});

test('existing persisted layout reads and asset-only saves retain independent groups, order and dock', () => {
  const { store, memory } = withDesktop();
  const envelope = JSON.parse(memory.getItem(key)!);
  envelope.desktopLayout.dock = [{ id: 'dock-b2', bookmarkId: 'b2' }];
  memory.setItem(key, JSON.stringify(envelope));
  const fresh = new StorageManager();
  const before = raw(memory);
  assert.deepEqual(fresh.getDesktopLayout(), envelope.desktopLayout);
  assert.deepEqual(raw(memory), before);
  fresh.saveBookmarks(fresh.getBookmarks().map(item => ({ ...item, pinnedToDesktop: false })));
  assert.deepEqual(new StorageManager().getDesktopLayout(), envelope.desktopLayout);
  assert.deepEqual(JSON.parse(memory.getItem(key)!).custom, { keep: true });
});
