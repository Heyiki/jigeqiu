import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Bookmark } from '../../src/types';
import { bookmarkFormInput, defaultBookmarkTitle, findDuplicateBookmark } from '../../src/services/bookmark-form';

const bookmark: Bookmark = {
  id: 'one', title: 'Old', url: 'https://old.example/', domain: 'old.example',
  icon: 'https://old.example/icon.png', iconMode: 'custom', category: 'legacy',
  notes: 'Keep old notes', keywords: ['old'], folderId: 'before',
  pinnedToDesktop: true, order: 8, collectionIds: ['collection'],
  createdAt: 1, updatedAt: 2,
};
const draft = {
  title: ' Updated ', url: 'new.example', folderId: 'after',
  keywords: ['图片', '壁纸', '图片'], iconMode: 'auto' as const, icon: undefined,
};

test('shared bookmark edit updates only fields exposed by the form', () => {
  const result = bookmarkFormInput(draft, { bookmark });
  assert.equal(result.title, 'Updated');
  assert.equal(result.url, 'https://new.example/');
  assert.equal(result.folderId, 'after');
  assert.deepEqual(result.keywords, ['图片', '壁纸']);
  assert.equal(result.icon, undefined);
  assert.equal(result.iconMode, 'auto');
  assert.equal(result.notes, 'Keep old notes');
  assert.deepEqual(result.collectionIds, ['collection']);
  assert.equal(result.category, 'legacy');
  assert.equal(result.pinnedToDesktop, true);
  assert.equal(result.order, 8);
});

test('library addition does not implicitly pin or join collections', () => {
  const result = bookmarkFormInput(draft, { order: 5 });
  assert.equal(result.pinnedToDesktop, false);
  assert.deepEqual(result.collectionIds, []);
  assert.equal(result.notes, undefined);
  assert.equal(result.order, 5);
});

test('desktop addition pins only when explicitly requested and root stays independent', () => {
  const result = bookmarkFormInput({ ...draft, folderId: undefined }, { pinToDesktop: true });
  assert.equal(result.folderId, undefined);
  assert.equal(result.pinnedToDesktop, true);
});

test('domain-based initial title tolerates incomplete URL input', () => {
  assert.equal(defaultBookmarkTitle('https://www.unsplash.com/photos'), 'Unsplash');
  assert.equal(defaultBookmarkTitle(''), '');
  assert.equal(defaultBookmarkTitle('https://'), '');
});

test('duplicate detection ignores the current item and malformed legacy records', () => {
  const items = [{ ...bookmark, id: 'broken', url: 'https://' }, bookmark];
  assert.equal(findDuplicateBookmark(items, 'old.example')?.id, 'one');
  assert.equal(findDuplicateBookmark(items, 'old.example', 'one'), undefined);
  assert.equal(findDuplicateBookmark(items, 'https://'), undefined);
});
