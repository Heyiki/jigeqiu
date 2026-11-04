import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareChromeLibraryImport } from '../../src/services/import-export/prototype-import';
import { MemoryStorage } from '../support/memory-storage';
import { storage } from '../../src/services/storage';

const html = '<DL><DT><H3>Chrome bar</H3><DL><DT><A HREF="https://example.org/a">Alpha</A><DT><H3>Nested</H3><DL><DT><A HREF="https://example.org/b">Beta</A></DL></DL></DL>';
test('Chrome preview preserves nested folders and does not create desktop shortcuts', () => {
  let id = 0;
  const result = prepareChromeLibraryImport(html, { bookmarks: [], folders: [] }, () => `new-${++id}`, 10);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.library.bookmarks.length, 2);
  assert.deepEqual(result.value.library.folders.map(folder => [folder.name, folder.parentId]), [
    ['Chrome bar', undefined], ['Nested', 'new-1'],
  ]);
  assert.ok(result.value.library.bookmarks.every(item => !item.pinnedToDesktop));
  assert.ok(result.value.library.folders.every(item => !item.pinnedToDesktop));
  assert.equal(result.value.library.bookmarks[0].folderId, 'new-1');
  assert.equal(result.value.library.bookmarks[1].folderId, 'new-3');
});

test('Chrome preview skips same-container duplicates but retains fragments and ports', () => {
  let id = 0;
  const result = prepareChromeLibraryImport('<DL><DT><A HREF="https://example.org/a#1">One</A><DT><A HREF="https://example.org/a#1">Duplicate</A><DT><A HREF="https://example.org/a#2">Two</A><DT><A HREF="https://example.org:9443/a#1">Port</A><DT><A HREF="javascript:1">Invalid</A></DL>',
    { bookmarks: [], folders: [] }, () => `x-${++id}`, 10);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.library.bookmarks.length, 3);
  assert.deepEqual(result.value.counts, { bookmarks: 3, folders: 0, skipped: 1, invalid: 1 });
});

test('one library write publishes folders and bookmarks together; stale or failed commit preserves existing data', () => {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  memory.setItem('jipage_bookmarks_v1', '[]');
  memory.setItem('jipage_folders_v1', '[]');
  const before = storage.readLibrary();
  const result = prepareChromeLibraryImport(html, before, (() => { let id = 0; return () => `p-${++id}`; })(), 10);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  memory.failWrites = true;
  assert.throws(() => storage.commitImportedLibrary(before, result.value.library));
  assert.deepEqual(storage.readLibrary(), before);
  memory.failWrites = false;
  storage.commitImportedLibrary(before, result.value.library);
  assert.deepEqual(storage.getBookmarks(), result.value.library.bookmarks);
  assert.deepEqual(storage.getFolders(), result.value.library.folders);
  assert.equal(memory.getItem('jipage_bookmarks_v1'), '[]');
  assert.equal(memory.getItem('jipage_folders_v1'), '[]');
  assert.throws(() => storage.commitImportedLibrary(before, result.value.library), /CONFLICT/);
  storage.updateBookmark(result.value.library.bookmarks[0].id, { pinnedToDesktop: true });
  assert.equal(storage.getBookmarks()[0].pinnedToDesktop, true);
  assert.deepEqual(storage.getFolders(), result.value.library.folders);
  const external = JSON.parse(memory.getItem('jipage_library_v2')!);
  external.bookmarks.push({ ...external.bookmarks[0], id: 'external-bookmark' });
  external.folders.push({ ...external.folders[0], id: 'external-folder', bookmarkIds: [] });
  memory.setItem('jipage_library_v2', JSON.stringify(external));
  assert.throws(() => storage.saveBookmarks(result.value.library.bookmarks), /CONFLICT/);
  assert.throws(() => storage.saveFolders(result.value.library.folders), /CONFLICT/);
  storage.exportJsonBackup();
  assert.throws(() => storage.saveBookmarks(result.value.library.bookmarks), /CONFLICT/);
  assert.throws(() => storage.saveFolders(result.value.library.folders), /CONFLICT/);
  assert.equal(JSON.parse(memory.getItem('jipage_library_v2')!).bookmarks.at(-1).id, 'external-bookmark');
});
