import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultTreeAdapter, parse } from 'parse5';
import type { DefaultTreeAdapterTypes as AST } from 'parse5';
import type { Bookmark, Folder } from '../../src/types';
import { exportBookmarkHtml } from '../../src/services/import-export/bookmark-html-export';
import { parseHtml } from '../../src/services/import-export/html';
import type { ImportNode } from '../../src/services/import-export/model';
import { StorageManager } from '../../src/services/storage';
import { MemoryStorage } from '../support/memory-storage';

function bookmark(id: string, overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id, title: id, url: `https://example.test/${id}`, domain: 'example.test',
    category: '', order: 0, collectionIds: [], pinnedToDesktop: false,
    createdAt: 1700000000000, updatedAt: 1700000000000, ...overrides,
  };
}

function folder(id: string, overrides: Partial<Folder> = {}): Folder {
  return {
    id, name: id, bookmarkIds: [], pinnedToDesktop: false, order: 0,
    createdAt: 1700000000000, updatedAt: 1700000000000, ...overrides,
  };
}

function roots(html: string): ImportNode[] {
  const parsed = parseHtml(html);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  if (!parsed.ok) throw new Error('Expected importable bookmark HTML');
  assert.deepEqual(parsed.value.notices, []);
  return parsed.value.roots;
}

function outline(nodes: ImportNode[]): unknown[] {
  return nodes.map(node => node.kind === 'bookmark'
    ? { title: node.input.title, url: node.input.url }
    : { folder: node.name, children: outline(node.children) });
}

function entries(nodes: ImportNode[]) {
  const bookmarks: string[] = [];
  const folders: string[] = [];
  const pending = [...nodes];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.kind === 'bookmark') bookmarks.push(node.input.url);
    else { folders.push(node.name); pending.push(...node.children); }
  }
  return { bookmarks: bookmarks.sort(), folders: folders.sort() };
}

test('StorageManager HTML export includes a normal manual bookmark with an empty category', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
  try {
    const manager = new StorageManager();
    manager.saveManualBookmark(bookmark('manual'));
    const exported = roots(manager.exportHtmlBookmarks());
    assert.equal(exported.length, 1, 'HTML must not omit an active bookmark without a legacy category');
    assert.equal(exported[0].kind, 'bookmark');
    if (exported[0].kind === 'bookmark') assert.equal(exported[0].input.url, 'https://example.test/manual');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('pure HTML export includes every bookmark regardless of category or stale membership lists', () => {
  const bookmarks = [
    bookmark('root', { category: 'deleted-category', order: 0 }),
    bookmark('filed', { folderId: 'archive', order: 1 }),
    bookmark('same-url', { url: 'https://example.test/filed', folderId: 'archive', order: 2 }),
  ];
  const folders = [
    folder('archive', { order: 3, bookmarkIds: ['root', 'filed', 'filed', 'missing'] }),
    folder('other', { order: 4, bookmarkIds: ['filed'] }),
  ];
  assert.deepEqual(outline(roots(exportBookmarkHtml(bookmarks, folders))), [
    { title: 'root', url: 'https://example.test/root' },
    { folder: 'archive', children: [
      { title: 'filed', url: 'https://example.test/filed' },
      { title: 'same-url', url: 'https://example.test/filed' },
    ] },
    { folder: 'other', children: [] },
  ]);
});

test('pure HTML export preserves sorted mixed archive hierarchy and empty folders through the real parser', () => {
  const bookmarks = [
    bookmark('tail', { order: 30 }),
    bookmark('last', { folderId: 'parent', order: 30 }),
    bookmark('inner', { folderId: 'nested', order: 0 }),
    bookmark('root', { order: 0 }),
    bookmark('first', { folderId: 'parent', order: 10 }),
  ];
  const folders = [
    folder('empty', { parentId: 'parent', order: 40 }),
    folder('nested', { parentId: 'parent', order: 20 }),
    folder('parent', { order: 10 }),
  ];
  assert.deepEqual(outline(roots(exportBookmarkHtml(bookmarks, folders))), [
    { title: 'root', url: 'https://example.test/root' },
    { folder: 'parent', children: [
      { title: 'first', url: 'https://example.test/first' },
      { folder: 'nested', children: [{ title: 'inner', url: 'https://example.test/inner' }] },
      { title: 'last', url: 'https://example.test/last' },
      { folder: 'empty', children: [] },
    ] },
    { title: 'tail', url: 'https://example.test/tail' },
  ]);
});

test('pure HTML export promotes dangling folders and bookmarks to root without losing valid children', () => {
  assert.deepEqual(outline(roots(exportBookmarkHtml([
    bookmark('unorganized', { order: 0 }),
    bookmark('dangling', { folderId: 'missing', order: 20 }),
    bookmark('child', { folderId: 'orphan' }),
  ], [folder('orphan', { parentId: 'missing', order: 10 })]))), [
    { title: 'unorganized', url: 'https://example.test/unorganized' },
    { folder: 'orphan', children: [{ title: 'child', url: 'https://example.test/child' }] },
    { title: 'dangling', url: 'https://example.test/dangling' },
  ]);
});

test('pure HTML export retains all folders and bookmarks in cycles and self-parent graphs exactly once', () => {
  const folders = [
    folder('a', { parentId: 'b', order: 3 }),
    folder('b', { parentId: 'c', order: 2 }),
    folder('c', { parentId: 'a', order: 1 }),
    folder('self', { parentId: 'self', order: 0 }),
    folder('branch', { parentId: 'a', order: 4 }),
  ];
  const bookmarks = folders.map(item => bookmark(`in-${item.id}`, { folderId: item.id }));
  const html = exportBookmarkHtml(bookmarks, folders);
  assert.deepEqual(entries(roots(html)), {
    bookmarks: [
      'https://example.test/in-a', 'https://example.test/in-b',
      'https://example.test/in-branch', 'https://example.test/in-c', 'https://example.test/in-self',
    ],
    folders: ['a', 'b', 'branch', 'c', 'self'],
  });
  assert.equal(exportBookmarkHtml(bookmarks, folders), html, 'Repair and output must be deterministic');
});

test('pure HTML export escapes labels and URL attributes without introducing markup or extra attributes', () => {
  const title = '</A><script>alert("x")</script>&\'"\u4e66';
  const name = '<img src=x onerror=alert(1)>&\'"\u76ee\u5f55';
  const url = 'https://example.test/?q="><img/src=x/onerror=alert(1)>&x=\'';
  const html = exportBookmarkHtml([bookmark('escaped', { title, url, folderId: 'safe' })], [
    folder('safe', { name }),
  ]);
  assert.deepEqual(outline(roots(html)), [
    { folder: name, children: [{ title, url }] },
  ]);
  const pending: AST.Node[] = [parse(html)];
  const links: AST.Element[] = [];
  while (pending.length) {
    const node = pending.pop()!;
    if (defaultTreeAdapter.isElementNode(node)) {
      assert.ok(!['script', 'img', 'iframe'].includes(node.tagName), `Unexpected ${node.tagName} element`);
      if (node.tagName === 'a') links.push(node);
    }
    if ('childNodes' in node) pending.push(...node.childNodes);
  }
  assert.equal(links.length, 1);
  assert.deepEqual(links[0].attrs.map(attribute => attribute.name).sort(), ['add_date', 'href']);
  assert.equal(links[0].attrs.find(attribute => attribute.name === 'href')?.value, url);
});

test('pure HTML export is deterministic and does not mutate frozen input arrays or records', () => {
  const bookmarks = [bookmark('second', { order: 2 }), bookmark('first', { order: 1 })];
  const folders = [folder('empty', { order: 3 })];
  const before = structuredClone({ bookmarks, folders });
  for (const item of folders) { Object.freeze(item.bookmarkIds); Object.freeze(item); }
  bookmarks.forEach(Object.freeze);
  Object.freeze(bookmarks);
  Object.freeze(folders);
  const html = exportBookmarkHtml(bookmarks, folders);
  assert.equal(exportBookmarkHtml(bookmarks, folders), html);
  assert.deepEqual({ bookmarks, folders }, before);
  assert.deepEqual(entries(roots(html)), {
    bookmarks: ['https://example.test/first', 'https://example.test/second'], folders: ['empty'],
  });
});

test('pure HTML export produces an importable empty library and retains a library of only empty folders', () => {
  assert.deepEqual(roots(exportBookmarkHtml([], [])), []);
  assert.deepEqual(outline(roots(exportBookmarkHtml([], [
    folder('child', { parentId: 'parent' }), folder('parent'),
  ]))), [{ folder: 'parent', children: [{ folder: 'child', children: [] }] }]);
});

test('pure HTML export handles deep archive chains without recursive stack overflow', () => {
  const folders = Array.from({ length: 12000 }, (_, index) =>
    folder(`f${index}`, index ? { parentId: `f${index - 1}` } : {}));
  const html = exportBookmarkHtml([bookmark('deep', { folderId: 'f11999' })], folders);
  assert.equal((html.match(/<H3\b/g) ?? []).length, 12000);
  assert.equal((html.match(/<A\b/g) ?? []).length, 1);
  assert.ok(html.includes('https://example.test/deep'));
});

for (const url of [
  'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\nscript:alert(1)',
  'data:text/html,<script>alert(1)</script>', 'file:///private/bookmarks',
  'vbscript:msgbox(1)', 'about:blank', 'mailto:private@example.test',
  'ftp://example.test/file', '//example.test/path', 'example.test/path',
  'https://user:secret@example.test/', 'https://user@example.test/',
  'http://:secret@example.test/', 'https://%75ser@example.test/', '',
]) {
  test(`pure HTML export rejects unsafe href ${JSON.stringify(url)} instead of emitting or skipping it`, () => {
    assert.throws(() => exportBookmarkHtml([
      bookmark('valid-before'), bookmark('invalid', { url }), bookmark('valid-after'),
    ], []), (cause: unknown) => cause instanceof Error && cause.message === 'INVALID_EXPORT_URL');
  });
}

test('pure HTML export validates but preserves legitimate HTTPS spelling and encoding in the href attribute', () => {
  const url = 'HTTPS://Example.TEST:443/Case/%2f%2F?q=%22%3C%26&literal="\'>&encoded=%2526#Part';
  const html = exportBookmarkHtml([bookmark('encoding', { url })], []);
  assert.ok(html.includes('HREF="HTTPS://Example.TEST:443/Case/%2f%2F?q=%22%3C%26&amp;literal=&quot;&#39;&gt;&amp;encoded=%2526#Part"'));
  assert.deepEqual(outline(roots(html)), [{ title: 'encoding', url }]);
});
