import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bookmarkCollectionItem, buildCollectionData, collectionSections,
  collectionMatches, collectionMarkdown, exportSingleCollection, safeCollectionFilename,
} from '../../src/services/collection-content';
import { preparePrototypeJsonImport } from '../../src/services/import-export/prototype-json';
import type { Bookmark, Collection } from '../../src/types';

const bookmark: Bookmark = {
  id: 'private-bm', title: 'Example', url: 'https://example.com/', domain: 'example.com',
  iconMode: 'text', notes: 'PRIVATE NOTE', keywords: ['PRIVATE KEYWORD'], category: 'legacy',
  tags: [], order: 0, pinnedToDesktop: true, collectionIds: [], createdAt: 1, updatedAt: 1,
};
const original: Collection = {
  id: 'collection', title: 'Tools', description: 'An introduction', category: 'legacy',
  authorId: 'old', authorName: 'Original author', visibility: 'private', isPinnedToDesktop: false,
  createdAt: 1, updatedAt: 2,
  items: [{ bookmarkId: bookmark.id, title: bookmark.title, url: bookmark.url,
    iconMode: 'text', domain: bookmark.domain, order: 0, recommendationReason: 'Intentional introduction' }],
};

test('selecting a bookmark creates an independent snapshot without private notes or keywords', () => {
  const item = bookmarkCollectionItem(bookmark);
  assert.equal(item.recommendationReason, '');
  assert.equal(item.bookmarkId, bookmark.id);
  assert.deepEqual(item.icon, { kind: 'monogram', value: 'Ex', color: null });
  item.title = 'Edited';
  assert.equal(bookmark.title, 'Example');
  assert.doesNotMatch(JSON.stringify(item), /PRIVATE/);
});

test('equivalent normalized icon URLs preserve the complete imported icon metadata', () => {
  const icon = { kind: 'url' as const, value: 'https://EXAMPLE.test:443/icon.png', mode: 'custom' as const, color: '#123456' };
  const item = bookmarkCollectionItem({ ...bookmark, iconMode: 'custom',
    icon: 'https://example.test/icon.png', assetIcon: icon });
  assert.deepEqual(item.icon, icon);
});

test('editing retains chapters, provenance and cover, and synchronizes flattened snapshot fields', () => {
  const sections = collectionSections(original);
  assert.equal(sections[0].items[0].recommendationReason, 'Intentional introduction');
  sections[0].title = 'Design';
  sections[0].description = 'First paragraph\nSecond paragraph';
  sections[0].items[0].title = 'New snapshot';
  sections[0].items[0].recommendationReason = 'New intro';
  const base = { ...original, assetContent: {
    cover: { kind: 'symbol' as const, symbol: 'X', color: '#fff' },
    provenance: [{ sourceId: 'source', title: 'Original', author: 'Author', url: null }],
    sections: collectionSections(original),
  } };
  const saved = buildCollectionData(base, ' Renamed ', ' Description ', sections);
  assert.equal(saved.title, 'Renamed');
  assert.equal(saved.description, 'Description');
  assert.equal(saved.items[0].title, 'New snapshot');
  assert.equal(saved.items[0].recommendationReason, 'New intro');
  assert.equal(saved.items[0].iconMode, 'text');
  assert.equal(saved.assetContent!.sections[0].description, 'First paragraph\nSecond paragraph');
  assert.deepEqual(saved.assetContent!.provenance, base.assetContent.provenance);
  assert.deepEqual(saved.assetContent!.cover, base.assetContent.cover);
  assert.equal(original.items[0].title, 'Example');
  assert.equal(base.assetContent.sections[0].title, '');
  assert.equal('id' in saved, false);
});

test('new data validates required titles, safe URLs and bounded content without discarding drafts', () => {
  const sections = collectionSections(original);
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'https://user:secret@example.com/']) {
    const invalid = structuredClone(sections);
    invalid[0].items[0].url = url;
    assert.throws(() => buildCollectionData(undefined, 'New', '', invalid), /INVALID_URL/);
  }
  assert.throws(() => buildCollectionData(undefined, '  ', '', sections), /TITLE_REQUIRED/);
  assert.throws(() => buildCollectionData(undefined, 'New', 'x'.repeat(32769), sections), /CONTENT_TOO_LONG/);
  const data = buildCollectionData(undefined, 'New', '', []);
  assert.equal(data.visibility, 'private');
  assert.deepEqual(data.items, []);
});

test('search covers independent text, chapter content, domain and introduction, not hidden private fields', () => {
  const sections = collectionSections(original);
  sections[0].title = 'Design';
  sections[0].description = '壁纸与图片';
  const collection = { ...original, ...buildCollectionData(original, original.title, original.description, sections) };
  for (const q of ['tools', 'INTRODUCTION', 'Design', '壁纸', 'example.com', 'intentional']) {
    assert.equal(collectionMatches(collection, q), true, q);
  }
  assert.equal(collectionMatches(collection, '   '), true);
  assert.equal(collectionMatches(collection, 'PRIVATE'), false);
});

test('single collection JSON is independently importable and carries no library data or settings', () => {
  const sections = collectionSections(original);
  sections[0].title = 'Chapter';
  sections[0].description = 'Full\nbody';
  const collection = { ...original, ...buildCollectionData(original, original.title, original.description, sections) };
  const text = exportSingleCollection(collection);
  const json = JSON.parse(text);
  assert.equal(json.scope, 'collection');
  assert.deepEqual(json.library, { bookmarks: [], folders: [], root: [] });
  assert.equal(json.collections[0].sections[0].items[0].bookmarkId, null);
  assert.doesNotMatch(text, /PRIVATE|settings|pinnedToDesktop/);
  let n = 0;
  const imported = preparePrototypeJsonImport(text, { bookmarks: [], folders: [], collections: [] }, false, () => `new-${++n}`, 10);
  assert.equal(imported.next.collections[0].assetContent!.sections[0].description, 'Full\nbody');
  assert.equal(imported.next.collections[0].items[0].recommendationReason, 'Intentional introduction');
});

test('Markdown escapes HTML, syntax and URL delimiters, and filename cannot become a path', () => {
  const sections = collectionSections(original);
  sections[0].title = 'Chapter';
  sections[0].description = '<script>alert(1)</script>\nParagraph';
  sections[0].items[0].title = 'Click [me]';
  sections[0].items[0].url = 'https://example.com/a(b)?x=1';
  const collection = { ...original, ...buildCollectionData(original, '# Title', 'Intro', sections) };
  const text = collectionMarkdown(collection);
  assert.match(text, /^# \\# Title/m);
  assert.match(text, /## Chapter/);
  assert.match(text, /Click \\\[me\\\]/);
  assert.doesNotMatch(text, /<script>/);
  assert.match(text, /a%28b%29/);
  assert.doesNotMatch(safeCollectionFilename('../../a/b\\c:*?"<>|\n'), /[/\\:*?"<>|\n]/);
});
