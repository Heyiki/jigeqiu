import assert from 'node:assert/strict';
import test from 'node:test';
import { createBookmarkSourceStorage, SOURCE_KEY, BROWSER_LIBRARY_KEY } from '../storage/source.ts';
import { STATE_KEY } from '../storage/local.ts';
import { configureApplicationStorage } from '../../src/services/application-storage.ts';
import { configureBookmarkSourcePlatform } from '../../src/services/bookmark-source-platform.ts';
import { StorageManager } from '../../src/services/storage.ts';
import { bookmarkFixture } from './bookmark-fixture.mjs';

function fixture() {
  const native = bookmarkFixture();
  const listeners = new Set();
  const changeListeners = new Set();
  let failWrites = false;
  const events = () => ({ addListener(fn) { listeners.add(fn); } });
  let granted = false;
  let allow = true;
  let requests = 0;
  let disk = {};
  let tail = Promise.resolve();
  const localLibrary = { version: 1, bookmarks: [{ id: 'local', title: 'Local', url: 'https://local.test/', order: 0, category: 'cat-inbox', collectionIds: [], pinnedToDesktop: false, createdAt: 1, updatedAt: 1 }], folders: [] };
  disk[STATE_KEY] = { version: 1, revision: 0, data: { jipage_library_v2: JSON.stringify(localLibrary), jipage_settings_v1: JSON.stringify({ language: 'en', dockBookmarkIds: ['local'] }) } };
  const area = {
    async get() { return structuredClone(disk); },
    async set(values) {
      if (failWrites) throw new Error('Disk full');
      disk = { ...disk, ...structuredClone(values) };
      const changes = Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }]));
      for (const listener of changeListeners) listener(changes, 'local');
    },
  };
  const chrome = {
    bookmarks: { ...native.api, onCreated: events(), onChanged: events(), onRemoved: events(), onMoved: events(), onChildrenReordered: events(), onImportEnded: events() },
    permissions: {
      async contains() { return granted; },
      async request() { requests++; if (allow) granted = true; return granted; },
      onRemoved: events(), onAdded: events(),
    },
  };
  const deps = { area, changes: { addListener(fn) { changeListeners.add(fn); } }, locks: { request(_name, fn) { const next = tail.then(fn); tail = next.catch(() => {}); return next; } }, legacy: () => ({ length: 0, key() { return null; }, getItem() { return null; } }), chrome };
  return { native, deps, disk: () => disk, localLibrary, revoke: () => { granted = false; }, deny: () => { allow = false; }, requests: () => requests, failWrites: () => { failWrites = true; }, emit: () => listeners.forEach(listener => listener()) };
}

async function open(f) { const driver = createBookmarkSourceStorage(f.deps); await driver.initialize(); return driver; }

for (const method of ['form', 'batch', 'update']) {
  test(`moving a browser bookmark via ${method} appends after destination bookmarks and folders`, async () => {
    const f = fixture();
    f.native.find('11').children.push({ id: '15', title: 'Last folder', children: [] });
    const first = await open(f);
    await first.switchSource('browser');
    const driver = await open(f);
    configureApplicationStorage(driver); configureBookmarkSourcePlatform(driver);
    try {
      const manager = new StorageManager();
      const snapshot = manager.readWorkbenchSnapshot();
      const bookmark = snapshot.bookmarks.find(item => item.id === 'browser-10');
      await manager.mutate(() => {
        if (method === 'form') manager.saveManualBookmark({ ...bookmark, folderId: 'browser-11' }, bookmark.id);
        else if (method === 'batch') manager.moveBookmarks([bookmark.id], 'browser-11');
        else manager.updateBookmark(bookmark.id, { folderId: 'browser-11' });
      });
      assert.deepEqual(f.native.find('11').children.map(item => item.id), ['12', '15', '10']);
      await manager.mutate(() => manager.saveManualBookmark({ ...manager.getBookmarks().find(item => item.id === bookmark.id), title: 'Rename only' }, bookmark.id));
      assert.deepEqual(f.native.find('11').children.map(item => item.id), ['12', '15', '10']);
      await manager.mutate(() => manager.moveBookmarks([bookmark.id]));
      assert.deepEqual(f.native.find('1').children.map(item => item.id), ['11', '13', '10']);
    } finally { configureApplicationStorage(undefined); configureBookmarkSourcePlatform(undefined); }
  });
}

for (const settings of [undefined, { language: 'en' }, { language: 'en', dockBookmarkIds: ['local'] }]) {
  test(`browser appearance saves preserve source isolation with ${settings === undefined ? 'no saved settings' : settings.dockBookmarkIds ? 'an existing Dock' : 'partial settings'}`, async () => {
    const f = fixture();
    if (settings === undefined) delete f.disk()[STATE_KEY].data.jipage_settings_v1;
    else f.disk()[STATE_KEY].data.jipage_settings_v1 = JSON.stringify(settings);
    const first = await open(f);
    configureApplicationStorage(first);
    const extensionDock = new StorageManager().getUserSettings().dockBookmarkIds;
    configureApplicationStorage(undefined);
    await first.switchSource('browser');
    const driver = await open(f);
    const nativeBefore = await f.native.api.getTree();
    const localBefore = f.disk()[STATE_KEY].data.jipage_library_v2;
    configureApplicationStorage(driver); configureBookmarkSourcePlatform(driver);
    try {
      const manager = new StorageManager();
      manager.readWorkbenchSnapshot();
      await manager.mutate(() => manager.saveUserSettings({ appearanceMode: 'dark-glass' }));
      await manager.mutate(() => manager.saveUserSettings({ wallpaperPreset: 'green-lake' }));
      assert.equal(manager.getUserSettings().appearanceMode, 'dark-glass');
      assert.equal(manager.getUserSettings().wallpaperPreset, 'green-lake');
      assert.deepEqual(manager.getUserSettings().dockBookmarkIds, []);
      assert.equal(driver.problem(), undefined);
      assert.deepEqual(await f.native.api.getTree(), nativeBefore);
      assert.equal(f.disk()[STATE_KEY].data.jipage_library_v2, localBefore);
      await driver.switchSource('extension');
      const local = await open(f);
      configureApplicationStorage(local); configureBookmarkSourcePlatform(local);
      const saved = new StorageManager().getUserSettings();
      assert.equal(saved.appearanceMode, 'dark-glass');
      assert.equal(saved.wallpaperPreset, 'green-lake');
      assert.deepEqual(saved.dockBookmarkIds, extensionDock);
    } finally { configureApplicationStorage(undefined); configureBookmarkSourcePlatform(undefined); }
  });
}

test('switching sources never merges or modifies either source and remembers browser metadata', async () => {
  const f = fixture();
  let driver = await open(f);
  assert.equal(driver.source(), 'extension');
  assert.deepEqual(JSON.parse(driver.storage.getItem('jipage_library_v2')), f.localLibrary);
  await driver.switchSource('browser');
  assert.equal(f.requests(), 1);
  driver = await open(f);
  assert.equal(driver.source(), 'browser');
  assert.equal(JSON.parse(driver.storage.getItem('jipage_library_v2')).bookmarks.length, 3);
  assert.deepEqual(JSON.parse(driver.storage.getItem('jipage_settings_v1')).dockBookmarkIds, []);
  await driver.mutate(() => {
    const library = JSON.parse(driver.storage.getItem('jipage_library_v2'));
    library.bookmarks[0].notes = 'Keep this';
    library.dockBookmarkIds = [library.bookmarks[0].id];
    driver.storage.setItem('jipage_library_v2', JSON.stringify(library));
  });
  await driver.switchSource('extension');
  driver = await open(f);
  assert.deepEqual(JSON.parse(driver.storage.getItem('jipage_library_v2')), f.localLibrary);
  assert.deepEqual(JSON.parse(driver.storage.getItem('jipage_settings_v1')).dockBookmarkIds, ['local']);
  f.native.find('10').title = 'Edited while disconnected';
  await driver.switchSource('browser');
  driver = await open(f);
  const browser = JSON.parse(driver.storage.getItem('jipage_library_v2'));
  assert.equal(browser.bookmarks[0].title, 'Edited while disconnected');
  assert.equal(browser.bookmarks[0].notes, 'Keep this');
  assert.ok(browser.dockBookmarkIds.length);
  assert.equal(f.native.calls.length, 0);
  assert.deepEqual(JSON.parse(f.disk()[STATE_KEY].data.jipage_library_v2), f.localLibrary);
});

test('denying permission keeps the extension source and writes no browser cache', async () => {
  const f = fixture();
  f.deny();
  const driver = await open(f);
  await assert.rejects(driver.switchSource('browser'), /BOOKMARK_PERMISSION_REQUIRED/);
  assert.equal(driver.source(), 'extension');
  assert.equal(f.disk()[STATE_KEY].data[SOURCE_KEY], undefined);
  assert.equal(f.disk()[STATE_KEY].data[BROWSER_LIBRARY_KEY], undefined);
  assert.equal(f.native.calls.length, 0);
});

test('all StorageManager entry points use the selected browser source', async () => {
  const f = fixture();
  const first = await open(f);
  await first.switchSource('browser');
  const driver = await open(f);
  configureApplicationStorage(driver); configureBookmarkSourcePlatform(driver);
  try {
    const manager = new StorageManager();
    manager.readWorkbenchSnapshot();
    const added = await manager.mutate(() => manager.saveManualBookmark({ title: 'Added', url: 'https://added.test/', order: 100, category: 'cat-inbox', collectionIds: [], pinnedToDesktop: true }));
    assert.ok(f.native.find('1').children.some(node => node.url === added.url));
    await manager.mutate(() => manager.updateBookmark(added.id, { title: 'Edited' }));
    assert.ok(f.native.find('1').children.some(node => node.title === 'Edited'));
    await manager.mutate(() => manager.deleteBookmark(added.id));
    assert.equal(f.native.find('1').children.some(node => node.url === added.url), false);
    const trash = manager.getBookmarkTrash();
    await manager.mutate(() => manager.restoreTrashedBookmark(trash[0].id));
    assert.ok(f.native.find('1').children.some(node => node.url === added.url));
    assert.deepEqual(JSON.parse(f.disk()[STATE_KEY].data.jipage_library_v2), f.localLibrary);
  } finally { configureApplicationStorage(undefined); configureBookmarkSourcePlatform(undefined); }
});

test('another page changing source rejects stale writes even when its page remains open', async () => {
  const f = fixture();
  const old = await open(f);
  const other = await open(f);
  await other.switchSource('browser');
  await assert.rejects(old.mutate(() => old.storage.setItem('jipage_library_v2', '{}')), /CONFLICT/);
  assert.deepEqual(JSON.parse(f.disk()[STATE_KEY].data.jipage_library_v2), f.localLibrary);
});

test('permission revocation blocks browser writes and allows returning to extension data', async () => {
  const f = fixture();
  let driver = await open(f);
  await driver.switchSource('browser');
  driver = await open(f);
  f.revoke();
  await assert.rejects(driver.mutate(() => {}), /BOOKMARK_PERMISSION_REQUIRED/);
  await driver.switchSource('extension');
  const local = await open(f);
  assert.deepEqual(JSON.parse(local.storage.getItem('jipage_library_v2')), f.localLibrary);
  assert.equal(f.native.calls.length, 0);
});

test('refresh reads external changes without modifying native bookmarks', async () => {
  const f = fixture();
  let driver = await open(f);
  await driver.switchSource('browser');
  driver = await open(f);
  f.native.find('10').title = 'Browser edit';
  await driver.refresh();
  assert.equal(JSON.parse(driver.storage.getItem('jipage_library_v2')).bookmarks[0].title, 'Browser edit');
  assert.equal(f.native.calls.length, 0);
});

test('editing one native duplicate preserves the other entry', async () => {
  const f = fixture();
  const first = await open(f);
  await first.switchSource('browser');
  const driver = await open(f);
  configureApplicationStorage(driver); configureBookmarkSourcePlatform(driver);
  try {
    const manager = new StorageManager();
    const original = manager.getBookmarks().find(bookmark => bookmark.title === 'Example');
    manager.getFolders(); manager.getDesktopLayout();
    await manager.mutate(() => manager.saveManualBookmark({ ...original, title: 'Renamed duplicate' }, original.id));
    assert.equal(f.native.find('10').title, 'Renamed duplicate');
    assert.equal(f.native.find('12').title, 'Another copy');
  } finally { configureApplicationStorage(undefined); configureBookmarkSourcePlatform(undefined); }
});

test('native writes followed by local persistence failure block retries with uncertain state', async () => {
  const f = fixture();
  const first = await open(f);
  await first.switchSource('browser');
  const driver = await open(f);
  f.failWrites();
  await assert.rejects(driver.mutate(() => {
    const library = JSON.parse(driver.storage.getItem('jipage_library_v2'));
    library.bookmarks[0].title = 'Native write succeeded';
    driver.storage.setItem('jipage_library_v2', JSON.stringify(library));
  }), /COMMIT_UNCERTAIN/);
  assert.equal(f.native.find('10').title, 'Native write succeeded');
  assert.equal(driver.problem(), 'uncertain');
  const writes = f.native.calls.length;
  await assert.rejects(driver.mutate(() => {}), /COMMIT_UNCERTAIN/);
  assert.equal(f.native.calls.length, writes);
});

test('other pages receive a source-change notice and preserve their old source', async () => {
  const f = fixture();
  const old = await open(f);
  const other = await open(f);
  let notified = false;
  old.subscribe(() => { notified = true; });
  await other.switchSource('browser');
  assert.equal(old.problem(), 'changed');
  assert.equal(old.source(), 'extension');
  assert.equal(notified, true);
});

test('native events refresh open browser-source pages', async () => {
  const f = fixture();
  const first = await open(f);
  await first.switchSource('browser');
  const driver = await open(f);
  f.native.find('10').title = 'External event';
  f.emit();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(JSON.parse(driver.storage.getItem('jipage_library_v2')).bookmarks[0].title, 'External event');
  assert.equal(f.native.calls.length, 0);
});

test('browser desktop pins and Dock survive switching and external changes independently of extension data', async () => {
  const f = fixture();
  const first = await open(f);
  await first.switchSource('browser');
  let driver = await open(f);
  configureApplicationStorage(driver); configureBookmarkSourcePlatform(driver);
  try {
    const manager = new StorageManager();
    manager.readWorkbenchSnapshot();
    const id = manager.getBookmarks()[0].id;
    await manager.mutate(() => manager.setDesktopPins([id], true));
    await manager.mutate(() => manager.saveUserSettings({ dockBookmarkIds: [id], language: 'zh' }));
    await driver.switchSource('extension');
    driver = await open(f);
    configureApplicationStorage(driver); configureBookmarkSourcePlatform(driver);
    const local = new StorageManager();
    assert.deepEqual(local.getBookmarks(), f.localLibrary.bookmarks);
    assert.deepEqual(local.getUserSettings().dockBookmarkIds, ['local']);
    assert.equal(local.getUserSettings().language, 'zh');
    f.native.find('10').title = 'A new native name';
    await driver.switchSource('browser');
    driver = await open(f);
    configureApplicationStorage(driver); configureBookmarkSourcePlatform(driver);
    const returned = new StorageManager();
    assert.equal(returned.getDesktopLayout().shortcuts[0].bookmarkId, id);
    assert.deepEqual(returned.getUserSettings().dockBookmarkIds, [id]);
    assert.equal(returned.getBookmarks()[0].title, 'A new native name');
    assert.deepEqual(JSON.parse(f.disk()[STATE_KEY].data.jipage_library_v2), f.localLibrary);
  } finally { configureApplicationStorage(undefined); configureBookmarkSourcePlatform(undefined); }
});

test('folder creation, nesting, moves, trash and restore operate on the native tree', async () => {
  const f = fixture();
  const first = await open(f);
  await first.switchSource('browser');
  const driver = await open(f);
  configureApplicationStorage(driver); configureBookmarkSourcePlatform(driver);
  try {
    const manager = new StorageManager();
    manager.readWorkbenchSnapshot();
    const original = manager.getBookmarks()[0];
    const folder = await manager.mutate(() => manager.createFolder('Created folder', [original.id]));
    const child = await manager.mutate(() => manager.createFolder('Child folder', [], folder.id));
    await manager.mutate(() => manager.updateFolder(child.id, { name: 'Renamed child' }));
    await manager.mutate(() => manager.moveBookmarks([original.id], child.id));
    const nativeFolder = f.native.find('1').children.find(node => node.title === 'Created folder');
    assert.equal(nativeFolder.children[0].title, 'Renamed child');
    assert.equal(nativeFolder.children[0].children[0].id, '10');
    await manager.mutate(() => manager.trashFolder(folder.id));
    assert.equal(f.native.find('10'), undefined);
    const entry = manager.getFolderTrash()[0];
    await manager.mutate(() => manager.restoreTrashedFolder(entry.id));
    const restored = f.native.find('1').children.find(node => node.title === 'Created folder');
    assert.equal(restored.children[0].children[0].title, 'Example');
    assert.equal(f.native.find('12').title, 'Another copy');
  } finally { configureApplicationStorage(undefined); configureBookmarkSourcePlatform(undefined); }
});

test('a deleted native duplicate can be restored alongside its existing copy', async () => {
  const f = fixture();
  const first = await open(f);
  await first.switchSource('browser');
  const driver = await open(f);
  configureApplicationStorage(driver); configureBookmarkSourcePlatform(driver);
  try {
    const manager = new StorageManager();
    manager.readWorkbenchSnapshot();
    const original = manager.getBookmarks()[0];
    await manager.mutate(() => manager.deleteBookmark(original.id));
    await manager.mutate(() => manager.restoreTrashedBookmark(manager.getBookmarkTrash()[0].id));
    assert.equal(manager.getBookmarks().filter(bookmark => bookmark.url === 'https://example.com/').length, 2);
    assert.equal(f.native.find('12').title, 'Another copy');
  } finally { configureApplicationStorage(undefined); configureBookmarkSourcePlatform(undefined); }
});
