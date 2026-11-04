import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageManager } from '../../src/services/storage';
import { MemoryStorage } from '../support/memory-storage';

const bookmark = {
  id: 'bm', title: '图片', url: 'https://example.test/p?q=1#x', domain: 'example.test',
  iconMode: 'text', category: 'legacy', notes: 'private note', keywords: ['壁纸'],
  folderId: 'folder', pinnedToDesktop: true, order: 1, collectionIds: [],
  createdAt: 10, updatedAt: 20,
};
const folder = { id: 'folder', name: 'Work', bookmarkIds: ['bm'], order: 1, pinnedToDesktop: false, createdAt: 10, updatedAt: 20 };
const collection = {
  id: 'col', title: 'Tools', description: 'My tools', category: 'legacy', authorId: 'me', authorName: 'Me',
  visibility: 'public', isPinnedToDesktop: true, createdAt: 10, updatedAt: 20,
  items: [{ bookmarkId: 'bm', title: 'Independent title', url: 'https://snapshot.test/', domain: 'snapshot.test', order: 0, recommendationReason: 'Why' }],
};
function setup(populated = true) {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  memory.setItem('jipage_bookmarks_v1', JSON.stringify(populated ? [bookmark] : []));
  memory.setItem('jipage_folders_v1', JSON.stringify(populated ? [folder] : []));
  memory.setItem('jipage_collections_v1', JSON.stringify(populated ? [collection] : []));
  memory.setItem('jipage_settings_v1', '{"language":"en","showDock":false}');
  return { memory, manager: new StorageManager() };
}
const bytes = (memory: Storage) => JSON.stringify(Array.from({ length: memory.length }, (_, i) =>
  [memory.key(i), memory.getItem(memory.key(i)!)]));

test('UI export contains versioned assets only, preserving notes, keywords and collection snapshots', () => {
  const { memory, manager } = setup();
  const before = bytes(memory);
  const data = JSON.parse(manager.exportJsonBackup());
  assert.equal(data.format, 'jigeqiu-assets');
  assert.equal(data.schemaVersion, 1);
  assert.deepEqual(Object.keys(data).sort(), ['format', 'schemaVersion', 'scope', 'exportedAt', 'library', 'collections'].sort());
  assert.equal(data.library.bookmarks[0].notes, 'private note');
  assert.deepEqual(data.library.bookmarks[0].keywords, ['壁纸']);
  assert.equal(data.collections[0].sections[0].items[0].title, 'Independent title');
  assert.equal(bytes(memory), before, 'Export must not write local data');
});

test('JSON preview is read-only and confirmation atomically imports mapped assets without settings or pins', () => {
  const exported = setup().manager.exportJsonBackup();
  const { memory, manager } = setup(false);
  const before = bytes(memory);
  const preview = manager.previewJsonAssetImport(exported);
  assert.deepEqual(preview.counts, { bookmarks: 1, folders: 1, collections: 1, skipped: 0 });
  assert.equal(bytes(memory), before);
  manager.commitJsonAssetImport(preview);
  const reloaded = new StorageManager();
  const bm = reloaded.getBookmarks()[0];
  assert.notEqual(bm.id, 'bm');
  assert.equal(bm.notes, 'private note');
  assert.deepEqual(bm.keywords, ['壁纸']);
  assert.equal(bm.createdAt, 10);
  assert.equal(bm.pinnedToDesktop, false);
  assert.equal(bm.folderId, reloaded.getFolders()[0].id);
  assert.deepEqual(reloaded.getFolders()[0].bookmarkIds, [bm.id]);
  assert.equal(reloaded.getCollections()[0].items[0].bookmarkId, bm.id);
  assert.equal(reloaded.getCollections()[0].items[0].url, 'https://snapshot.test/');
  assert.equal(memory.getItem('jipage_settings_v1'), '{"language":"en","showDock":false}');
  assert.equal(memory.getItem('jipage_collections_v1'), '[]', 'Legacy key is retained unchanged');
});

test('quota failure preserves all domains and retains an import preview for retry', () => {
  const exported = setup().manager.exportJsonBackup();
  const { memory, manager } = setup(false);
  const preview = manager.previewJsonAssetImport(exported);
  const before = bytes(memory);
  memory.failWrites = true;
  assert.throws(() => manager.commitJsonAssetImport(preview), /quota|write|denied/i);
  assert.equal(bytes(memory), before);
  memory.failWrites = false;
  manager.commitJsonAssetImport(preview);
  assert.equal(new StorageManager().getCollections().length, 1);
});

test('concurrent collection changes and tampered candidates reject before any write', () => {
  const exported = setup().manager.exportJsonBackup();
  const { memory, manager } = setup(false);
  const preview = manager.previewJsonAssetImport(exported);
  const tampered = structuredClone(preview);
  assert.throws(() => manager.commitJsonAssetImport(tampered), /PREVIEW_STALE|IMPORT_INVALID/);
  memory.setItem('jipage_collections_v1', JSON.stringify([collection]));
  const before = bytes(memory);
  assert.throws(() => manager.commitJsonAssetImport(preview), /CONFLICT|PREVIEW_STALE/);
  assert.equal(bytes(memory), before);
});

test('repeat import skips identical assets and allows explicit independent copies', () => {
  const { manager, memory } = setup();
  const data = manager.exportJsonBackup();
  const repeat = manager.previewJsonAssetImport(data);
  assert.deepEqual(repeat.counts, { bookmarks: 0, folders: 0, collections: 0, skipped: 3 });
  const before = bytes(memory);
  manager.commitJsonAssetImport(repeat);
  assert.equal(bytes(memory), before, 'A no-op confirmation must not migrate data');
  const copies = manager.previewJsonAssetImport(data, true);
  manager.commitJsonAssetImport(copies);
  assert.equal(manager.getBookmarks().length, 2);
  assert.equal(manager.getCollections().length, 2);
});

test('invalid/unknown/old backups reject and ignored settings are reported without application', () => {
  const { manager, memory } = setup();
  const data = JSON.parse(manager.exportJsonBackup());
  for (const text of ['{', JSON.stringify({ ...data, schemaVersion: 99 }), JSON.stringify({ version: '1.0.0', bookmarks: [] })]) {
    const before = bytes(memory);
    assert.throws(() => manager.previewJsonAssetImport(text));
    assert.equal(bytes(memory), before);
  }
  const preview = manager.previewJsonAssetImport(JSON.stringify({ ...data, settings: { language: 'zh' } }));
  assert.ok(preview.notices.some(n => n.code === 'IGNORED_NON_ASSET_FIELD'));
  assert.equal(memory.getItem('jipage_settings_v1'), '{"language":"en","showDock":false}');
  assert.equal(manager.importJsonBackup('{"version":"1.0.0","settings":{"language":"zh"}}'), false);
  assert.equal(memory.getItem('jipage_settings_v1'), '{"language":"en","showDock":false}');
});

test('imported collections remain atomic with subsequent collection and bookmark writes', () => {
  const data = setup().manager.exportJsonBackup();
  const { manager } = setup(false);
  manager.commitJsonAssetImport(manager.previewJsonAssetImport(data));
  const collections = manager.getCollections();
  manager.saveCollections([{ ...collections[0], title: 'Renamed' }]);
  const bm = manager.getBookmarks()[0];
  manager.saveManualBookmark({ ...bm, title: 'Changed bookmark' }, bm.id);
  assert.equal(new StorageManager().getCollections()[0].title, 'Renamed');
  assert.equal(new StorageManager().getBookmarks()[0].title, 'Changed bookmark');
});

test('JSON round trip preserves chosen auto/custom icon intent and copied collection sections', () => {
  const { manager, memory } = setup();
  memory.setItem('jipage_bookmarks_v1', JSON.stringify([{
    ...bookmark, icon: 'https://example.test/icon.png', iconMode: 'auto',
  }]));
  const data = manager.exportJsonBackup();
  const target = setup(false).manager;
  target.commitJsonAssetImport(target.previewJsonAssetImport(data));
  assert.equal(target.getBookmarks()[0].iconMode, 'auto');
  target.cloneCollection(target.getCollections()[0]);
  const exported = JSON.parse(target.exportJsonBackup());
  assert.equal(exported.collections.length, 2);
});

test('corrupt collection JSON never falls back to an empty backup and unsafe URLs reject without writes', () => {
  const { manager, memory } = setup();
  const data = JSON.parse(manager.exportJsonBackup());
  data.library.bookmarks[0].url = 'javascript:alert(1)';
  const before = bytes(memory);
  assert.throws(() => manager.previewJsonAssetImport(JSON.stringify(data)));
  assert.equal(bytes(memory), before);
  memory.setItem('jipage_collections_v1', '{bad');
  assert.throws(() => manager.exportJsonBackup(), /CORRUPT_DATA/);
});

test('merge appends after sparse legacy order without moving existing content', () => {
  const data = setup().manager.exportJsonBackup();
  const { manager, memory } = setup(false);
  memory.setItem('jipage_bookmarks_v1', JSON.stringify([
    { ...bookmark, id: 'a', folderId: undefined, order: 10 },
    { ...bookmark, id: 'b', url: 'https://b.test/', folderId: undefined, order: 20 },
  ]));
  manager.commitJsonAssetImport(manager.previewJsonAssetImport(data));
  const exported = JSON.parse(manager.exportJsonBackup());
  assert.deepEqual(exported.library.root.slice(0, 2).map((r: { id: string }) => r.id), ['a', 'b']);
});

test('accepted monograms and long icon URLs survive round trip without blocking backup', () => {
  const source = JSON.parse(setup().manager.exportJsonBackup());
  for (const icon of [
    { kind: 'monogram', value: 'Z', color: '#ff0000' },
    { kind: 'url', value: `https://example.test/${'a'.repeat(4500)}.png`, color: null },
  ]) {
    const { manager } = setup(false);
    source.library.bookmarks[0].icon = icon;
    manager.commitJsonAssetImport(manager.previewJsonAssetImport(JSON.stringify(source)));
    assert.deepEqual(JSON.parse(manager.exportJsonBackup()).library.bookmarks[0].icon, icon);
  }
});

test('title-only editing preserves URL icon metadata across URL normalization', () => {
  const source = JSON.parse(setup().manager.exportJsonBackup());
  const icon = { kind: 'url', value: 'https://EXAMPLE.test:443/icon.png', color: '#ff0000', mode: 'custom' };
  source.library.bookmarks[0].icon = icon;
  const { manager } = setup(false);
  manager.commitJsonAssetImport(manager.previewJsonAssetImport(JSON.stringify(source)));
  const saved = manager.getBookmarks()[0];
  manager.saveManualBookmark({ ...saved, title: 'Edited title' }, saved.id);
  assert.deepEqual(JSON.parse(manager.exportJsonBackup()).library.bookmarks[0].icon, icon);
});

test('JSON merging keeps an existing independent desktop and Dock unchanged', () => {
  const { manager, memory } = setup();
  manager.executeDesktop([
    { type: 'desktop.pin', bookmarkId: bookmark.id, shortcutId: 'existing-shortcut', to: { kind: 'root', index: 0 } },
  ]);
  const before = JSON.parse(memory.getItem('jipage_library_v2')!);
  const data = JSON.parse(manager.exportJsonBackup());
  data.library.bookmarks[0].url = 'https://new.test/';
  manager.commitJsonAssetImport(manager.previewJsonAssetImport(JSON.stringify(data), true));
  const after = JSON.parse(memory.getItem('jipage_library_v2')!);
  assert.deepEqual(after.desktopLayout, before.desktopLayout);
  assert.deepEqual(after.bookmarks[0], before.bookmarks[0]);
  assert.equal(after.bookmarks.length, 2);
  assert.equal(after.bookmarks[1].pinnedToDesktop, false);
});

test('multi-section collection, covers and provenance survive two transfers and copies', () => {
  const data = JSON.parse(setup().manager.exportJsonBackup());
  const c = data.collections[0];
  c.cover = { kind: 'url', url: 'https://example.test/cover.png' };
  c.provenance = [{ sourceId: 'author-original', title: 'Original', author: 'Author', url: 'https://example.test/article' }];
  c.sections.push({ id: 'section-two', title: 'Next chapter', description: 'Chapter description', items: [{
    id: 'item-orphan', bookmarkId: 'deleted-original', title: 'Orphan snapshot', url: 'https://orphan.test/',
    icon: null, recommendationReason: 'Explanation',
  }] });
  const target = setup(false).manager;
  const preview = target.previewJsonAssetImport(JSON.stringify(data));
  assert.ok(preview.notices.some(n => n.code === 'IMPORT_BOOKMARK_LINK_DETACHED'));
  target.commitJsonAssetImport(preview);
  target.cloneCollection(target.getCollections()[0]);
  const result = JSON.parse(target.exportJsonBackup());
  for (const copy of result.collections) {
    assert.deepEqual(copy.cover, c.cover);
    assert.deepEqual(copy.provenance.slice(0, c.provenance.length), c.provenance, 'Existing attribution is retained');
    assert.ok(copy.provenance.length <= c.provenance.length + 1, 'A clone may append its direct source');
    assert.equal(copy.sections[1].title, 'Next chapter');
    assert.equal(copy.sections[1].items[0].bookmarkId, null);
    assert.equal(copy.sections[1].items[0].recommendationReason, 'Explanation');
  }
});
