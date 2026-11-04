import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssetSnapshot, Collection, ErrorCode, Result } from '../../src/domain/assets/model';
import { ASSET_LIMITS, validateSnapshot } from '../../src/domain/assets/validation';
import { exportAssets, parseJson } from '../../src/services/import-export/exchange';
import type { AssetExchange } from '../../src/services/import-export/model';
import { bookmarkSnapshot, emptySnapshot } from '../support/asset-fixtures';

function value<T>(result: Result<T>): T {
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('Expected success');
  return result.value;
}

function failure<T>(result: Result<T>, code?: ErrorCode): void {
  assert.equal(result.ok, false, JSON.stringify(result));
  if (!result.ok && code) assert.equal(result.error.code, code);
}

function collection(): Collection {
  return {
    id: 'c1', title: 'Public list', description: 'Description',
    cover: { kind: 'symbol', symbol: 'C', color: '#123456' },
    provenance: [{ sourceId: 'source', title: 'Original', author: 'Author', url: 'https://source.test/' }],
    sections: [{ id: 's1', title: 'Section', description: '', items: [{
      id: 'i1', bookmarkId: 'b1', title: 'Independent title', url: 'http://snapshot.test/A?b=2&a=1#X',
      icon: null, recommendationReason: 'Public reason',
    }] }],
    createdAt: 1, updatedAt: 2,
  };
}

function snapshot(): AssetSnapshot {
  const s = bookmarkSnapshot();
  s.library.bookmarks[0].notes = 'PRIVATE-SECRET';
  s.library.bookmarks[0].keywords = ['private-keyword'];
  s.library.bookmarks.push({ ...s.library.bookmarks[0], id: 'b2', title: 'Second', notes: '' });
  s.library.folders.push(
    { id: 'f1', name: 'Same', children: [], createdAt: 1, updatedAt: 1 },
    { id: 'f2', name: 'Same', children: [{ kind: 'bookmark', id: 'b2' }], createdAt: 1, updatedAt: 1 },
  );
  s.library.root = [{ kind: 'folder', id: 'f2' }, { kind: 'bookmark', id: 'b1' }, { kind: 'folder', id: 'f1' }];
  s.collections = [collection()];
  s.layout.shortcuts = [{ id: 'sc1', bookmarkId: 'b1' }];
  s.layout.root = [{ kind: 'shortcut', id: 'sc1' }];
  s.layout.dock = [{ id: 'd1', bookmarkId: 'b1' }];
  s.trash = [{ id: 't1', deletedAt: 3, origin: { parentId: null, index: 0 },
    payload: { kind: 'bookmark', bookmark: { ...s.library.bookmarks[0], id: 'deleted', notes: 'TRASH-SECRET' } } }];
  return s;
}

function exchange(s: AssetSnapshot = snapshot()): AssetExchange {
  return { format: 'jigeqiu-assets', schemaVersion: 1, scope: 'all', exportedAt: 10,
    library: s.library, collections: s.collections };
}

function parse(input: unknown) {
  return parseJson(JSON.stringify(input));
}

test('exports only active assets, with notes, keywords and independent collection snapshots', () => {
  const s = snapshot();
  const before = structuredClone(s);
  const result = value(exportAssets(s, { kind: 'all' }, 10));
  assert.deepEqual(result, exchange(before));
  assert.deepEqual(Object.keys(result).sort(),
    ['collections', 'exportedAt', 'format', 'library', 'schemaVersion', 'scope']);
  assert.equal(JSON.stringify(result).includes('TRASH-SECRET'), false);
  result.library.bookmarks[0].keywords.push('changed');
  result.collections[0].sections[0].items[0].title = 'changed';
  assert.deepEqual(s, before);
});

test('single collection exports detach links and never leak library notes or keywords', () => {
  const s = snapshot();
  const before = structuredClone(s);
  const result = value(exportAssets(s, { kind: 'collection', id: 'c1' }, 12));
  assert.equal(result.scope, 'collection');
  assert.equal(result.exportedAt, 12);
  assert.deepEqual(result.library, { bookmarks: [], folders: [], root: [] });
  const expected = collection();
  expected.sections[0].items[0].bookmarkId = null;
  assert.deepEqual(result.collections, [expected]);
  assert.equal(JSON.stringify(result).includes('PRIVATE-SECRET'), false);
  assert.equal(JSON.stringify(result).includes('private-keyword'), false);
  assert.equal(value(parse(result)).collections[0].sections[0].items[0].recommendationReason, 'Public reason');
  assert.deepEqual(s, before);
});

test('empty export is a valid noninvented empty import', () => {
  const exported = value(exportAssets(emptySnapshot(), { kind: 'all' }, 0));
  assert.deepEqual(value(parse(exported)), { format: 'json', roots: [], collections: [], notices: [] });
});

test('JSON round trip preserves empty same-name folders and reference-based mixed order', () => {
  const s = snapshot();
  const doc = value(parse(value(exportAssets(s, { kind: 'all' }, 10))));
  assert.deepEqual(doc.roots, [
    { kind: 'folder', sourceId: 'f2', name: 'Same', children: [{
      kind: 'bookmark', sourceId: 'b2', input: {
        title: 'Second', url: 'https://example.com/', icon: null, notes: '', keywords: ['private-keyword'],
      },
    }] },
    { kind: 'bookmark', sourceId: 'b1', input: {
      title: 'Example', url: 'https://example.com/', icon: null, notes: 'PRIVATE-SECRET', keywords: ['private-keyword'],
    } },
    { kind: 'folder', sourceId: 'f1', name: 'Same', children: [] },
  ]);
  assert.deepEqual(doc.collections, s.collections);
  assert.deepEqual(doc.notices, []);
});

test('ignored top-level nonasset fields each emit a notice and cannot override assets', () => {
  const e = exchange();
  const doc = value(parse({ ...e,
    settings: { library: { bookmarks: [{ id: 'injected' }] }, theme: 'dark' },
    history: { collections: [{ id: 'injected' }] },
    layout: { root: ['not-imported'] },
  }));
  assert.equal(doc.notices.length, 3);
  assert.deepEqual(doc.notices.map(n => n.details.field).sort(), ['history', 'layout', 'settings']);
  assert.ok(doc.notices.every(n => n.code === 'IGNORED_NON_ASSET_FIELD'));
  assert.deepEqual(doc.collections, e.collections);
  assert.equal(doc.roots[1].sourceId, 'b1');
  assert.equal(JSON.stringify(doc).includes('injected'), false);
});

test('only enumerated known legacy nonasset keys are ignored with individual notices', () => {
  const fields = ['settings', 'searchEngines', 'history', 'recentSearches', 'recentUsed',
    'layout', 'dock', 'categories', 'tags', 'plugins'];
  const input = { ...exchange(), ...Object.fromEntries(fields.map(field => [field, { ignored: true }])) };
  const doc = value(parse(input));
  assert.deepEqual(doc.notices.map(n => n.details.field).sort(), [...fields].sort());
  assert.ok(doc.notices.every(n => n.code === 'IGNORED_NON_ASSET_FIELD'));
  failure(parse({ ...input, userSettings: {} }), 'IMPORT_INVALID');
});

test('missing bookmark associations survive parse for explicit reject/detach preview decisions', () => {
  const e = exchange();
  e.collections[0].sections[0].items[0].bookmarkId = 'missing-source';
  const doc = value(parse(e));
  assert.equal(doc.collections[0].sections[0].items[0].bookmarkId, 'missing-source');
  assert.deepEqual(doc.notices, [{
    code: 'MISSING_BOOKMARK_LINK',
    details: { collectionId: 'c1', sectionId: 's1', itemId: 'i1', bookmarkId: 'missing-source' },
  }]);
  assert.equal(e.collections[0].sections[0].items[0].bookmarkId, 'missing-source');
});

test('export rejects nonexistent collection, invalid timestamp and malformed scope', () => {
  failure(exportAssets(snapshot(), { kind: 'collection', id: 'missing' }, 1), 'NOT_FOUND');
  for (const at of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1']) {
    failure(exportAssets(snapshot(), { kind: 'all' }, at as number), 'INVALID_INPUT');
  }
  for (const scope of [null, {}, { kind: 'other' }, { kind: 'all', id: 'c1' },
    { kind: 'collection' }, { kind: 'collection', id: '' }, { kind: 'collection', id: 'c1', extra: true }]) {
    failure(exportAssets(snapshot(), scope as { kind: 'all' }, 1), 'INVALID_INPUT');
  }
});

test('export validates its snapshot without repairing or mutating corrupt assets', () => {
  const s = snapshot();
  s.library.root.push({ kind: 'bookmark', id: 'missing' });
  const before = structuredClone(s);
  failure(exportAssets(s, { kind: 'all' }, 1));
  failure(exportAssets(s, { kind: 'collection', id: 'c1' }, 1));
  assert.deepEqual(s, before);
});

test('export rejects accessor and Proxy inputs without executing getters', () => {
  let reads = 0;
  const s = snapshot();
  Object.defineProperty(s, 'library', { enumerable: true, get() { reads++; return {}; } });
  failure(exportAssets(s, { kind: 'all' }, 1));
  const scope = Object.defineProperty({}, 'kind', { enumerable: true, get() { reads++; return 'all'; } });
  failure(exportAssets(snapshot(), scope as { kind: 'all' }, 1));
  failure(exportAssets(new Proxy(snapshot(), {}), { kind: 'all' }, 1));
  assert.equal(reads, 0);
});

for (const text of ['', ' ', '{', 'null', '[]', '{}', 'true', '"text"', '{"format":',
  '{"format":"jigeqiu-assets","schemaVersion":1,"scope":"all","exportedAt":0,"library":{},"collections":[]}']) {
  test(`rejects corrupt or incomplete JSON ${JSON.stringify(text)}`, () => {
    failure(parseJson(text), 'IMPORT_INVALID');
  });
}

test('runtime nonstring input is rejected without invoking coercion', () => {
  let reads = 0;
  failure(parseJson({ toString() { reads++; return '{}'; } } as unknown as string), 'IMPORT_INVALID');
  assert.equal(reads, 0);
});

test('unknown format/version rejected and prototype version 1.0.0 requires legacy preview', () => {
  for (const patch of [{ format: 'other' }, { schemaVersion: 2 }, { schemaVersion: '1' }]) {
    failure(parse({ ...exchange(), ...patch }), 'UNSUPPORTED_VERSION');
  }
  failure(parse({ version: '1.0.0', bookmarks: [], settings: {} }), 'LEGACY_REQUIRES_PREVIEW');
  failure(parse({ ...exchange(), version: '1.0.0' }), 'LEGACY_REQUIRES_PREVIEW');
  failure(parse({ ...exchange(), version: '2.0.0' }), 'IMPORT_INVALID');
});

test('unknown top-level and nested fields reject, including prototype names and asset overrides', () => {
  for (const key of ['snapshot', 'bookmarks', 'roots', 'extra', '__proto__', 'constructor', 'trash']) {
    const e = exchange();
    failure(parse({ ...e, [key]: {} }), 'IMPORT_INVALID');
  }
  const e = exchange();
  Object.assign(e.library.bookmarks[0], { settings: {} });
  failure(parse(e), 'IMPORT_INVALID');
});

test('required headers and asset fields are never defaulted or normalized', () => {
  for (const key of ['format', 'schemaVersion', 'scope', 'exportedAt', 'library', 'collections']) {
    const e = { ...exchange() } as Record<string, unknown>;
    delete e[key];
    failure(parse(e), 'IMPORT_INVALID');
  }
  for (const patch of [{ scope: 'other' }, { exportedAt: -1 }, { exportedAt: 1.5 },
    { collections: null }, { library: null }]) failure(parse({ ...exchange(), ...patch }), 'IMPORT_INVALID');
  const e = exchange();
  delete (e.library.bookmarks[0] as unknown as Record<string, unknown>).notes;
  failure(parse(e), 'IMPORT_INVALID');
});

test('collection scope requires an empty library and exactly one collection', () => {
  failure(parse({ ...exchange(), scope: 'collection' }), 'IMPORT_INVALID');
  failure(parse({ ...exchange(emptySnapshot()), scope: 'collection' }), 'IMPORT_INVALID');
  const s = emptySnapshot();
  const c = collection(); c.sections[0].items[0].bookmarkId = null;
  s.collections = [c];
  assert.deepEqual(value(parse({ ...exchange(s), scope: 'collection' })).collections, [c]);
});

test('rejects duplicate source IDs across folders, bookmarks, collections, sections and items', () => {
  for (const mutate of [
    (s: AssetSnapshot) => { s.library.folders[0].id = 'b1'; },
    (s: AssetSnapshot) => { s.collections[0].id = 'b1'; },
    (s: AssetSnapshot) => { s.collections[0].sections[0].id = 'c1'; },
    (s: AssetSnapshot) => { s.collections[0].sections[0].items[0].id = 's1'; },
  ]) {
    const s = snapshot(); mutate(s); failure(parse(exchange(s)), 'IMPORT_INVALID');
  }
});

test('rejects cycles, orphans, wrong-kind references and multiply owned entities', () => {
  for (const mutate of [
    (s: AssetSnapshot) => { s.library.folders[0].children.push({ kind: 'folder', id: 'f1' }); },
    (s: AssetSnapshot) => { s.library.root.pop(); },
    (s: AssetSnapshot) => { s.library.root.push({ kind: 'folder', id: 'b1' }); },
    (s: AssetSnapshot) => { s.library.root.push({ kind: 'bookmark', id: 'b1' }); },
    (s: AssetSnapshot) => { s.library.folders[0].children.push({ kind: 'folder', id: 'missing' }); },
  ]) {
    const s = snapshot(); mutate(s);
    s.collections[0].sections[0].items[0].bookmarkId = 'also-missing';
    failure(parse(exchange(s)), 'IMPORT_INVALID');
  }
});

test('unsafe bookmark, item, icon, cover and provenance URLs reject rather than repair', () => {
  for (const mutate of [
    (s: AssetSnapshot) => { s.library.bookmarks[0].url = 'javascript:alert(1)'; },
    (s: AssetSnapshot) => { s.library.bookmarks[0].url = ' example.com '; },
    (s: AssetSnapshot) => { s.library.bookmarks[0].icon = { kind: 'url', value: 'data:image/png;base64,AA', color: null }; },
    (s: AssetSnapshot) => { s.collections[0].cover = { kind: 'url', url: 'https://user:pass@example.test/' }; },
    (s: AssetSnapshot) => { s.collections[0].provenance[0].url = 'file:///tmp/a'; },
    (s: AssetSnapshot) => { s.collections[0].sections[0].items[0].url = 'https://'; },
  ]) {
    const s = snapshot(); mutate(s); failure(parse(exchange(s)), 'IMPORT_INVALID');
  }
});

test('malformed missing association IDs cannot hide behind detached-copy validation', () => {
  for (const link of ['', 42, {}, 'x'.repeat(ASSET_LIMITS.idLength + 1)]) {
    const e = exchange();
    (e.collections[0].sections[0].items[0] as unknown as Record<string, unknown>).bookmarkId = link;
    failure(parse(e), 'IMPORT_INVALID');
  }
});

test('schema rejects overlong notes, titles, keywords and excess keywords without truncation', () => {
  for (const patch of [
    { notes: 'x'.repeat(ASSET_LIMITS.textLength + 1) },
    { title: 'x'.repeat(ASSET_LIMITS.titleLength + 1) },
    { keywords: ['x'.repeat(ASSET_LIMITS.keywordLength + 1)] },
    { keywords: Array(ASSET_LIMITS.keywords + 1).fill('x') },
  ]) {
    const e = exchange(); Object.assign(e.library.bookmarks[0], patch); failure(parse(e));
  }
});

test('raw UTF-8 byte budget includes whitespace and ignored settings', () => {
  failure(parseJson(' '.repeat(ASSET_LIMITS.bytes + 1)), 'IMPORT_TOO_LARGE');
  failure(parse({ ...exchange(), settings: '界'.repeat(Math.ceil(ASSET_LIMITS.bytes / 3)) }), 'IMPORT_TOO_LARGE');
});

test('ignored nonasset data remains subject to JSON depth and array budgets', () => {
  let settings: unknown = {};
  for (let i = 0; i <= ASSET_LIMITS.jsonDepth; i++) settings = { nested: settings };
  failure(parse({ ...exchange(), settings }), 'IMPORT_TOO_LARGE');
  failure(parse({ ...exchange(), history: Array(ASSET_LIMITS.arrayLength + 1).fill(null) }), 'IMPORT_TOO_LARGE');
});

test('enforces total entity and library depth budgets without recursive overflow', () => {
  const s = emptySnapshot();
  const b = bookmarkSnapshot().library.bookmarks[0];
  for (let i = 0; i < ASSET_LIMITS.nodes; i++) {
    s.library.bookmarks.push({ ...b, id: `b${i}` });
    s.library.root.push({ kind: 'bookmark', id: `b${i}` });
  }
  const c = collection();
  s.collections.push(c);
  failure(parse(exchange(s)), 'IMPORT_TOO_LARGE');
  const tree = emptySnapshot();
  for (let i = 0; i <= ASSET_LIMITS.libraryDepth; i++) {
    tree.library.folders.push({ id: `f${i}`, name: '', createdAt: 1, updatedAt: 1,
      children: i < ASSET_LIMITS.libraryDepth ? [{ kind: 'folder', id: `f${i + 1}` }] : [] });
  }
  tree.library.root = [{ kind: 'folder', id: 'f0' }];
  failure(parse(exchange(tree)), 'IMPORT_TOO_LARGE');
});

test('accepts 5000 bookmarks without regrouping or changing their URLs', () => {
  const s = emptySnapshot();
  for (let i = 0; i < 5000; i++) {
    s.library.bookmarks.push({ ...bookmarkSnapshot().library.bookmarks[0], id: `b${i}`,
      url: `https://example.test/${i}?b=2&a=1#X` });
    s.library.root.unshift({ kind: 'bookmark', id: `b${i}` });
  }
  const doc = value(parse(exchange(s)));
  assert.equal(doc.roots.length, 5000);
  assert.equal(doc.roots[0].sourceId, 'b4999');
  assert.equal(doc.roots[4999].sourceId, 'b0');
  assert.equal(doc.roots[0].kind, 'bookmark');
  if (doc.roots[0].kind === 'bookmark') assert.equal(doc.roots[0].input.url, 'https://example.test/4999?b=2&a=1#X');
});

test('64-deep library export/parse round trip preserves every folder and the leaf bookmark', () => {
  const s = bookmarkSnapshot();
  for (let i = 0; i < 64; i++) {
    s.library.folders.push({
      id: `f${i}`, name: `Folder ${i}`, createdAt: 1, updatedAt: 1,
      children: [i === 63 ? { kind: 'bookmark', id: 'b1' } : { kind: 'folder', id: `f${i + 1}` }],
    });
  }
  s.library.root = [{ kind: 'folder', id: 'f0' }];
  const before = structuredClone(s);
  const exported = value(exportAssets(s, { kind: 'all' }, 10));
  assert.deepEqual(exported.library, before.library);
  const doc = value(parse(exported));
  let children = doc.roots;
  for (let i = 0; i < 64; i++) {
    assert.equal(children.length, 1);
    const node = children[0];
    assert.equal(node.kind, 'folder');
    if (node.kind !== 'folder') throw new Error('Expected folder');
    assert.equal(node.sourceId, `f${i}`);
    assert.equal(node.name, `Folder ${i}`);
    children = node.children;
  }
  assert.deepEqual(children, [{
    kind: 'bookmark', sourceId: 'b1',
    input: { title: 'Example', url: 'https://example.com/', icon: null, notes: '', keywords: [] },
  }]);
  assert.deepEqual(doc.collections, []);
  assert.deepEqual(doc.notices, []);
  assert.deepEqual(s, before);
});

test('returned exchange is independently valid with empty layout and trash', () => {
  const e = value(exportAssets(snapshot(), { kind: 'all' }, 1));
  assert.equal(validateSnapshot({ library: e.library, collections: e.collections,
    layout: emptySnapshot().layout, trash: [] }).ok, true);
});
