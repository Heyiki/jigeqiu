import assert from 'node:assert/strict';
import test from 'node:test';
import type { Bookmark, Folder } from '../../src/types';
import { bookmarkTreeRows } from '../../src/components/common/bookmark-tree';

const folders = [
  { id: 'work', name: '工作', order: 0 },
  { id: 'dev', name: '开发', parentId: 'work', order: 0 },
  { id: 'empty', name: '空目录', order: 1 },
] as Folder[];
const bookmarks = [
  { id: 'root', title: 'Root', url: 'https://root.test', order: 0 },
  { id: 'git', title: 'GitHub', url: 'https://github.com', folderId: 'dev', keywords: ['code'], order: 0 },
  { id: 'docs', title: 'Docs', url: 'https://docs.test', folderId: 'work', order: 0 },
  { id: 'lost', title: 'Lost', url: 'https://lost.test', folderId: 'missing', order: 1 },
] as Bookmark[];
const keys = (rows: ReturnType<typeof bookmarkTreeRows>) => rows.map(row => row.key);

test('all directories are expanded by default and every URL appears exactly once, including orphans', () => {
  const rows = bookmarkTreeRows(folders, bookmarks);
  assert.deepEqual(keys(rows), ['bookmark:root', 'bookmark:lost', 'folder:work', 'bookmark:docs', 'folder:dev', 'bookmark:git', 'folder:empty']);
  assert.equal(rows.find(row => row.key === 'bookmark:git')?.depth, 2);
  const work = rows.find(row => row.key === 'folder:work');
  assert.ok(work?.kind === 'folder' && work.expanded);
});

test('collapse hides descendants, while filtering reveals matching URLs and ancestor directories', () => {
  assert.deepEqual(keys(bookmarkTreeRows(folders, bookmarks, '', new Set())), [
    'bookmark:root', 'bookmark:lost', 'folder:work', 'folder:empty',
  ]);
  for (const query of ['github', ' CODE ', '开发']) {
    assert.deepEqual(keys(bookmarkTreeRows(folders, bookmarks, query, new Set())), [
      'folder:work', 'folder:dev', 'bookmark:git',
    ]);
  }
  assert.deepEqual(keys(bookmarkTreeRows(folders, bookmarks, '工作')), [
    'folder:work', 'bookmark:docs', 'folder:dev', 'bookmark:git',
  ]);
  assert.deepEqual(bookmarkTreeRows(folders, bookmarks, 'not-found'), []);
});

test('malformed folder edges and duplicate bookmark IDs are safe and do not mutate inputs', () => {
  const malformed = [{ id: 'a', name: 'A', parentId: 'b', order: 0 }, { id: 'b', name: 'B', parentId: 'a', order: 0 }] as Folder[];
  const before = JSON.stringify(malformed);
  const rows = bookmarkTreeRows(malformed, [...bookmarks, bookmarks[0]]);
  assert.equal(rows.filter(row => row.kind === 'bookmark').length, bookmarks.length);
  assert.equal(rows.filter(row => row.kind === 'folder').length, 2);
  assert.equal(JSON.stringify(malformed), before);
});
