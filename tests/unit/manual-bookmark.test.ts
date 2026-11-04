import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeBookmarkUrl, parseBookmarkKeywords, normalizeBookmarkIcon } from '../../src/services/bookmark-input';
import { storage, StorageManager } from '../../src/services/storage';
import { MemoryStorage } from '../support/memory-storage';

test('manual bookmark input accepts only HTTP(S) and normalizes keywords without losing URL distinctions', () => {
  assert.equal(normalizeBookmarkUrl('example.org:9443/a#2'), 'https://example.org:9443/a#2');
  assert.equal(normalizeBookmarkUrl(' HTTPS://example.org/a#1 '), 'https://example.org/a#1');
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'ftp://example.org', 'https://', '']) {
    assert.throws(() => normalizeBookmarkUrl(url));
  }
  assert.deepEqual(parseBookmarkKeywords('图片，壁纸, 图片\n Photos,photos'), ['图片', '壁纸', 'Photos']);
});

test('icon choices allow only safe URLs and persist text/automatic intent without image data', () => {
  assert.deepEqual(normalizeBookmarkIcon('https://example.com/icon.png', 'auto'),
    { icon: 'https://example.com/icon.png', iconMode: 'auto' });
  assert.deepEqual(normalizeBookmarkIcon('https://example.com/icon.png', 'text'),
    { icon: undefined, iconMode: 'text' });
  for (const icon of ['data:image/png;base64,abc', 'javascript:alert(1)', 'https://a:b@example.com/x', '/logo.png']) {
    assert.throws(() => normalizeBookmarkIcon(icon, 'custom'));
  }
});

test('manual save atomically creates and edits a bookmark with folder membership and keywords; failure preserves library', () => {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  memory.setItem('jipage_bookmarks_v1', '[]');
  memory.setItem('jipage_folders_v1', JSON.stringify([
    { id: 'folder-a', name: 'A', bookmarkIds: [], pinnedToDesktop: false, order: 1, createdAt: 1, updatedAt: 1 },
    { id: 'folder-b', name: 'B', bookmarkIds: [], pinnedToDesktop: false, order: 2, createdAt: 1, updatedAt: 1 },
  ]));
  storage.getBookmarks();
  storage.getFolders();
  const input = {
    title: 'Unsplash', url: 'https://example.org/photos', domain: 'example.org', category: 'cat-inbox',
    pinnedToDesktop: true, folderId: 'folder-a', order: 1, collectionIds: [], keywords: ['图片', '壁纸'],
  };
  memory.failWrites = true;
  assert.throws(() => storage.saveManualBookmark(input));
  assert.equal(memory.getItem('jipage_library_v2'), null);
  memory.failWrites = false;
  const created = storage.saveManualBookmark(input);
  assert.deepEqual(storage.getFolders()[0].bookmarkIds, [created.id]);
  assert.deepEqual(storage.getBookmarks()[0].keywords, ['图片', '壁纸']);
  const second = storage.saveManualBookmark({ ...input, title: 'Second', url: 'https://example.org/second' });
  storage.saveManualBookmark({ ...created, title: 'Renamed only' }, created.id);
  assert.deepEqual(storage.getFolders()[0].bookmarkIds, [created.id, second.id]);
  const updated = storage.saveManualBookmark({ ...created, title: 'Photo desk', folderId: 'folder-b', keywords: ['素材'] }, created.id);
  assert.equal(updated.id, created.id);
  assert.deepEqual(storage.getFolders().map(folder => folder.bookmarkIds), [[second.id], [created.id]]);
  assert.equal(storage.getBookmarks().length, 2);
  const before = memory.getItem('jipage_library_v2');
  assert.throws(() => storage.saveManualBookmark({ ...input, url: 'javascript:alert(1)' }));
  assert.throws(() => storage.saveManualBookmark({ ...input, folderId: 'missing' }));
  assert.throws(() => storage.saveManualBookmark(input), /DUPLICATE/);
  assert.equal(memory.getItem('jipage_library_v2'), before);
});

test('manual icon selections survive reload, failed saves and explicit reset to automatic or text', () => {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  memory.setItem('jipage_bookmarks_v1', '[]');
  memory.setItem('jipage_folders_v1', '[]');
  // A fresh manager mirrors a page reload without reusing the prior test's version baseline.
  const manager = new StorageManager();
  const created = manager.saveManualBookmark({
    title: 'Icons', url: 'https://icons.example.org/', domain: 'icons.example.org', category: 'cat-inbox',
    icon: 'https://icons.example.org/logo.png', iconMode: 'custom', pinnedToDesktop: false,
    order: 0, collectionIds: [],
  });
  const reloaded = new StorageManager();
  assert.equal(reloaded.getBookmarks()[0].iconMode, 'custom');
  const before = memory.getItem('jipage_library_v2');
  memory.failWrites = true;
  assert.throws(() => reloaded.saveManualBookmark({ ...created, iconMode: 'text' }, created.id));
  memory.failWrites = false;
  assert.equal(memory.getItem('jipage_library_v2'), before);
  reloaded.saveManualBookmark({ ...created, icon: undefined, iconMode: 'auto' }, created.id);
  assert.equal(reloaded.getBookmarks()[0].icon, undefined);
  reloaded.saveManualBookmark({ ...created, iconMode: 'text' }, created.id);
  assert.equal(reloaded.getBookmarks()[0].iconMode, 'text');
  assert.equal(reloaded.getBookmarks()[0].icon, undefined);
});
