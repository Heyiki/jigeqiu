import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssetEnvelope, AssetSnapshot, Collection, ErrorCode, Result } from '../../src/domain/assets/model';
import { ASSET_LIMITS, validateEnvelope, validateSnapshot } from '../../src/domain/assets/validation';
import { bookmarkSnapshot, emptySnapshot } from '../support/asset-fixtures';

function fails(value: unknown, code: ErrorCode = 'INVALID_INPUT') {
  const result = validateSnapshot(value);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, code);
}
function succeeds<T>(result: Result<T>, value: T) {
  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.ok) {
    assert.deepEqual(result.value, value);
    assert.notEqual(result.value, value);
  }
}
function collection(): Collection {
  return {
    id: 'c1', title: 'List', description: '', cover: null, provenance: [],
    sections: [{ id: 'section1', title: '', description: '', items: [{
      id: 'item1', bookmarkId: 'b1', title: 'Snapshot', url: 'https://example.org/',
      icon: null, recommendationReason: '',
    }] }], createdAt: 1, updatedAt: 1,
  };
}
function folder(snapshot: AssetSnapshot, id: string) {
  snapshot.library.folders.push({ id, name: 'Same', children: [], createdAt: 1, updatedAt: 1 });
  return snapshot.library.folders.at(-1)!;
}
function envelope(): AssetEnvelope {
  return { format: 'jigeqiu-local-assets', schemaVersion: 1,
    version: { storeId: 'store1', revision: 1, commitId: 'commit1' },
    committedAt: 1, snapshot: bookmarkSnapshot() };
}

test('accepts empty and complete snapshots as independent copies without normalizing or mutating', () => {
  const s = bookmarkSnapshot();
  folder(s, 'f1').children.push(s.library.root.pop()!);
  folder(s, 'f2');
  s.library.root.push({ kind: 'folder', id: 'f1' }, { kind: 'folder', id: 'f2' });
  s.layout.shortcuts.push({ id: 'shortcut1', bookmarkId: 'b1' });
  s.layout.folders.push({ id: 'desktop1', name: 'Same', shortcutIds: ['shortcut1'] });
  s.layout.root.push({ kind: 'desktop-folder', id: 'desktop1' });
  s.layout.dock.push({ id: 'pin1', bookmarkId: 'b1' });
  s.collections.push(collection());
  const before = structuredClone(s);
  succeeds(validateSnapshot(s), s);
  const empty = emptySnapshot();
  succeeds(validateSnapshot(empty), empty);
  assert.deepEqual(s, before);
});

test('rejects Proxy arrays that forge iteration methods instead of validating their elements', () => {
  const s = emptySnapshot();
  s.library.bookmarks = new Proxy([42], {
    get(target, key, receiver) {
      if (key === 'forEach') return () => {};
      if (key === 'map') return () => [];
      return Reflect.get(target, key, receiver);
    },
  }) as unknown as AssetSnapshot['library']['bookmarks'];
  fails(s);
  assert.equal(validateEnvelope({ ...envelope(), snapshot: s }).ok, false);
});

test('rejects even well-shaped Proxies without reading toJSON or ordinary properties', () => {
  let toJSONReads = 0;
  let lengthReads = 0;
  const s = emptySnapshot();
  s.library.bookmarks = new Proxy([], {
    get(target, key, receiver) {
      if (key === 'toJSON') {
        toJSONReads++;
        return () => [];
      }
      if (key === 'length') lengthReads++;
      return Reflect.get(target, key, receiver);
    },
  });
  fails(s);
  assert.equal(toJSONReads, 0);
  assert.equal(lengthReads, 0);
  assert.equal(validateSnapshot(new Proxy(bookmarkSnapshot(), {})).ok, false);
});

test('success is deeply detached and JSON round-trips remain valid for both entry points', () => {
  const s = bookmarkSnapshot();
  const result = validateSnapshot(s);
  succeeds(result, s);
  if (!result.ok) return;
  result.value.library.bookmarks[0].keywords.push('copy-only');
  assert.deepEqual(s.library.bookmarks[0].keywords, []);
  assert.equal(validateSnapshot(JSON.parse(JSON.stringify(result.value))).ok, true);
  const e = envelope();
  const validated = validateEnvelope(e);
  succeeds(validated, e);
  if (!validated.ok) return;
  e.snapshot.library.bookmarks[0].url = 'javascript:changed';
  assert.equal(validated.value.snapshot.library.bookmarks[0].url, 'https://example.com/');
  assert.equal(validateEnvelope(JSON.parse(JSON.stringify(validated.value))).ok, true);
});

test('descriptor preflight rejects nested ordinary getters before clone can execute them', () => {
  let reads = 0;
  const s = bookmarkSnapshot();
  Object.defineProperty(s.library.bookmarks[0], 'title', {
    enumerable: true, get() { reads++; return 'Example'; },
  });
  fails(s);
  assert.equal(validateEnvelope({ ...envelope(), snapshot: s }).ok, false);
  assert.equal(reads, 0);
});

test('rejects missing, unknown, wrongly typed and non-JSON schema values', () => {
  for (const value of [null, [], {}, { ...emptySnapshot(), extra: 1 },
    { ...emptySnapshot(), trash: undefined }, new Date(), new Map()]) fails(value);
  for (const value of [undefined, NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const s = bookmarkSnapshot();
    (s.library.bookmarks[0] as unknown as Record<string, unknown>).createdAt = value;
    fails(s);
  }
  const s = bookmarkSnapshot();
  Object.assign(s.library.bookmarks[0], { folderId: 'old' });
  fails(s);
});

test('accepts HTTP/HTTPS only and never repairs URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/plain,x', 'file:///x', 'example.com', ' https://example.com/', 'https://']) {
    const s = bookmarkSnapshot(); s.library.bookmarks[0].url = url; fails(s, 'INVALID_URL');
  }
  const s = bookmarkSnapshot(); s.library.bookmarks[0].url = 'http://example.com/A?b=2&a=1#X';
  succeeds(validateSnapshot(s), s);
  s.collections.push(collection()); s.collections[0].sections[0].items[0].url = 'ftp://example.org';
  fails(s, 'INVALID_URL');
});

test('strictly checks icons, covers and provenance without accepting embedded image data', () => {
  const s = bookmarkSnapshot();
  s.library.bookmarks[0].icon = { kind: 'monogram', value: 'E', color: '#123456' };
  s.collections.push(collection());
  s.collections[0].cover = { kind: 'symbol', symbol: 'E', color: '#abcdef' };
  s.collections[0].provenance.push({ sourceId: 'external', title: null, author: null, url: 'https://example.org' });
  succeeds(validateSnapshot(s), s);
  s.library.bookmarks[0].icon = { kind: 'url', value: 'data:image/png;base64,AA==', color: null };
  fails(s, 'INVALID_URL');
  s.library.bookmarks[0].icon = null;
  s.collections[0].cover = { kind: 'url', url: 'javascript:alert(1)' }; fails(s, 'INVALID_URL');
});

test('enforces global entity IDs across kinds, sections, items and trash', () => {
  const s = bookmarkSnapshot(); folder(s, 'b1'); fails(s, 'ID_COLLISION');
  const c = bookmarkSnapshot(); c.collections.push(collection()); c.collections[0].sections[0].id = 'b1';
  fails(c, 'ID_COLLISION');
  const t = bookmarkSnapshot();
  t.trash.push({ id: 'trash1', deletedAt: 2, origin: { parentId: null, index: 0 },
    payload: { kind: 'bookmark', bookmark: structuredClone(t.library.bookmarks[0]) } });
  fails(t, 'ID_COLLISION');
});

test('library rejects duplicate ownership, wrong-kind, missing and orphan references', () => {
  const s = bookmarkSnapshot(); s.library.root.push({ kind: 'bookmark', id: 'b1' }); fails(s, 'INVALID_REFERENCE');
  s.library.root = []; fails(s, 'INVALID_REFERENCE');
  s.library.root = [{ kind: 'folder', id: 'b1' }]; fails(s, 'INVALID_REFERENCE');
  s.library.root = [{ kind: 'bookmark', id: 'missing' }]; fails(s, 'INVALID_REFERENCE');
});

test('detects cycles even in disconnected library components', () => {
  const s = emptySnapshot();
  folder(s, 'f1').children.push({ kind: 'folder', id: 'f2' });
  folder(s, 'f2').children.push({ kind: 'folder', id: 'f1' });
  fails(s, 'CYCLE');
});

test('desktop is independent, singly owned, one level, active-only and bookmark-unique', () => {
  const s = bookmarkSnapshot();
  s.layout.shortcuts.push({ id: 'sc1', bookmarkId: 'b1' });
  fails(s, 'INVALID_REFERENCE');
  s.layout.root.push({ kind: 'shortcut', id: 'sc1' }); succeeds(validateSnapshot(s), s);
  s.layout.folders.push({ id: 'df1', name: '', shortcutIds: ['sc1'] });
  s.layout.root.push({ kind: 'desktop-folder', id: 'df1' }); fails(s, 'INVALID_REFERENCE');
  s.layout.root.shift(); succeeds(validateSnapshot(s), s);
  s.layout.shortcuts.push({ id: 'sc2', bookmarkId: 'b1' });
  s.layout.root.push({ kind: 'shortcut', id: 'sc2' }); fails(s, 'INVALID_REFERENCE');
  s.layout.shortcuts.pop(); s.layout.root.pop();
  s.layout.folders[0].shortcutIds = ['df1']; fails(s, 'INVALID_REFERENCE');
  s.layout.folders[0].shortcutIds = ['sc1']; s.layout.shortcuts[0].bookmarkId = 'missing';
  fails(s, 'INVALID_REFERENCE');
});

test('dock permits desktop overlap but rejects repeat pins and missing bookmarks', () => {
  const s = bookmarkSnapshot();
  s.layout.dock.push({ id: 'pin1', bookmarkId: 'b1' }); succeeds(validateSnapshot(s), s);
  s.layout.dock.push({ id: 'pin2', bookmarkId: 'b1' }); fails(s, 'INVALID_REFERENCE');
  s.layout.dock.pop(); s.layout.dock[0].bookmarkId = 'missing'; fails(s, 'INVALID_REFERENCE');
});

test('active and trashed collections may only associate with active bookmarks', () => {
  const s = bookmarkSnapshot(); s.collections.push(collection());
  s.trash.push({ id: 'trash1', deletedAt: 2, origin: null,
    payload: { kind: 'collection', index: 999, collection: { ...collection(), id: 'c2', sections: [] } } });
  succeeds(validateSnapshot(s), s);
  s.collections[0].sections[0].items[0].bookmarkId = 'missing'; fails(s, 'INVALID_REFERENCE');
  s.collections = [];
  const c = collection();
  s.trash[0].payload = { kind: 'collection', index: 0, collection: c };
  s.library.root = []; s.library.bookmarks = [];
  fails(s, 'INVALID_REFERENCE');
  c.sections[0].items[0].bookmarkId = null; succeeds(validateSnapshot(s), s);
});

test('trash subtree must be complete with exactly its declared folder root', () => {
  const s = emptySnapshot(); const tree = bookmarkSnapshot();
  folder(tree, 'f1').children.push(tree.library.root.pop()!);
  tree.library.root.push({ kind: 'folder', id: 'f1' });
  s.trash.push({ id: 'trash1', deletedAt: 2, origin: { parentId: 'missing-parent', index: 999 },
    payload: { kind: 'folder-tree', rootFolderId: 'f1', library: tree.library } });
  succeeds(validateSnapshot(s), s);
  tree.library.root.push({ kind: 'bookmark', id: 'b1' }); fails(s, 'INVALID_REFERENCE');
  tree.library.root.pop(); tree.library.folders[0].children = []; fails(s, 'INVALID_REFERENCE');
});

test('trash origins and collection indices are required, safe, nonnegative and kind-correct', () => {
  const s = emptySnapshot();
  s.trash.push({ id: 'trash1', deletedAt: 2, origin: null,
    payload: { kind: 'bookmark', bookmark: bookmarkSnapshot().library.bookmarks[0] } });
  fails(s);
  s.trash[0].origin = { parentId: null, index: -1 }; fails(s);
  s.trash[0].origin.index = 1000; succeeds(validateSnapshot(s), s);
  s.trash[0].payload = { kind: 'collection', collection: { ...collection(), sections: [] }, index: 0 };
  fails(s);
  s.trash[0].origin = null; succeeds(validateSnapshot(s), s);
  s.trash[0].payload.index = 0.5; fails(s);
});

test('trash original parent cannot name a known non-folder or its own subtree', () => {
  const s = bookmarkSnapshot();
  const b = { ...s.library.bookmarks[0], id: 'deleted' };
  s.trash.push({ id: 'trash1', deletedAt: 2, origin: { parentId: 'b1', index: 0 },
    payload: { kind: 'bookmark', bookmark: b } });
  fails(s, 'INVALID_REFERENCE');
  s.trash[0].origin!.parentId = 'missing-folder'; succeeds(validateSnapshot(s), s);
  const tree = emptySnapshot(); folder(tree, 'f1'); tree.library.root.push({ kind: 'folder', id: 'f1' });
  s.trash[0].payload = { kind: 'folder-tree', rootFolderId: 'f1', library: tree.library };
  s.trash[0].origin!.parentId = 'f1'; fails(s, 'INVALID_REFERENCE');
});

test('envelope validates every field and positive safe revisions without altering input', () => {
  const e = envelope(); succeeds(validateEnvelope(e), e);
  for (const patch of [{ schemaVersion: 2 }, { format: 'other' }, { extra: true },
    { version: { ...e.version, revision: 0 } }, { version: { ...e.version, revision: Number.MAX_SAFE_INTEGER + 1 } },
    { committedAt: Infinity }, { snapshot: {} }]) {
    assert.equal(validateEnvelope({ ...e, ...patch }).ok, false);
  }
  e.version.revision = Number.MAX_SAFE_INTEGER; succeeds(validateEnvelope(e), e);
});

test('enforces inclusive text/keyword limits and rejects excess without truncation', () => {
  const s = bookmarkSnapshot(); const b = s.library.bookmarks[0];
  b.title = 'x'.repeat(ASSET_LIMITS.titleLength); b.notes = 'x'.repeat(ASSET_LIMITS.textLength);
  b.keywords = Array.from({ length: ASSET_LIMITS.keywords }, () => 'x'.repeat(ASSET_LIMITS.keywordLength));
  succeeds(validateSnapshot(s), s);
  b.title += 'x'; fails(s); assert.equal(b.title.length, ASSET_LIMITS.titleLength + 1);
  b.title = 'x'; b.keywords.push('one-too-many'); fails(s);
});

test('enforces library depth inclusively and accepts 5000 bookmarks', () => {
  const s = emptySnapshot();
  for (let i = 0; i < ASSET_LIMITS.libraryDepth; i++) {
    const f = folder(s, `f${i}`);
    if (i) s.library.folders[i - 1].children.push({ kind: 'folder', id: f.id });
    else s.library.root.push({ kind: 'folder', id: f.id });
  }
  succeeds(validateSnapshot(s), s);
  folder(s, 'too-deep'); s.library.folders.at(-2)!.children.push({ kind: 'folder', id: 'too-deep' }); fails(s);
  const large = emptySnapshot();
  for (let i = 0; i < 5000; i++) {
    large.library.bookmarks.push({ ...bookmarkSnapshot().library.bookmarks[0], id: `b${i}` });
    large.library.root.push({ kind: 'bookmark', id: `b${i}` });
  }
  succeeds(validateSnapshot(large), large);
});

test('rejects excessive entity counts, byte budgets, array sizes and cyclic JS values', () => {
  const s = emptySnapshot();
  for (let i = 0; i <= ASSET_LIMITS.nodes; i++) {
    s.library.bookmarks.push({ ...bookmarkSnapshot().library.bookmarks[0], id: `b${i}` });
    s.library.root.push({ kind: 'bookmark', id: `b${i}` });
  }
  fails(s);
  const big = emptySnapshot();
  for (let i = 0; i < 600; i++) {
    big.library.bookmarks.push({ ...bookmarkSnapshot().library.bookmarks[0], id: `b${i}`, notes: 'x'.repeat(ASSET_LIMITS.textLength) });
    big.library.root.push({ kind: 'bookmark', id: `b${i}` });
  }
  fails(big);
  const cyclic = emptySnapshot(); (cyclic as unknown as Record<string, unknown>).trash = cyclic; fails(cyclic);
});

test('entity limit is inclusive and counts trashed entities, sections and items too', () => {
  const s = emptySnapshot();
  const b = bookmarkSnapshot().library.bookmarks[0];
  for (let i = 0; i < ASSET_LIMITS.nodes; i++) {
    s.library.bookmarks.push({ ...b, id: `b${i}` });
    s.library.root.push({ kind: 'bookmark', id: `b${i}` });
  }
  succeeds(validateSnapshot(s), s);
  s.trash.push({ id: 't1', deletedAt: 1, origin: null,
    payload: { kind: 'collection', index: 0, collection: collection() } });
  fails(s);
});

test('serialized UTF-8 byte budget is inclusive rather than a character count', () => {
  const s = emptySnapshot();
  const b = bookmarkSnapshot().library.bookmarks[0];
  for (let i = 0; i < 520; i++) {
    s.library.bookmarks.push({ ...b, id: `b${i}` });
    s.library.root.push({ kind: 'bookmark', id: `b${i}` });
  }
  let remaining = ASSET_LIMITS.bytes - Buffer.byteLength(JSON.stringify(s), 'utf8');
  for (const item of s.library.bookmarks) {
    const count = Math.min(remaining, ASSET_LIMITS.textLength);
    item.notes = 'x'.repeat(count); remaining -= count;
  }
  assert.equal(remaining, 0);
  assert.equal(Buffer.byteLength(JSON.stringify(s), 'utf8'), ASSET_LIMITS.bytes);
  succeeds(validateSnapshot(s), s);
  s.library.bookmarks.at(-1)!.notes += 'x'; fails(s);
  s.library.bookmarks.at(-1)!.notes = '';
  s.library.bookmarks[0].notes = '界'.repeat(ASSET_LIMITS.textLength); fails(s);
});

test('ID, URL, notes and keyword lengths have inclusive explicit bounds', () => {
  const s = bookmarkSnapshot(); const b = s.library.bookmarks[0];
  b.id = 'b'.repeat(ASSET_LIMITS.idLength); s.library.root[0].id = b.id;
  b.url = 'https://example.com/' + 'x'.repeat(ASSET_LIMITS.urlLength - 'https://example.com/'.length);
  b.notes = 'x'.repeat(ASSET_LIMITS.textLength);
  b.keywords = ['x'.repeat(ASSET_LIMITS.keywordLength)];
  succeeds(validateSnapshot(s), s);
  b.id += 'b'; s.library.root[0].id = b.id; fails(s);
  b.id = 'b1'; s.library.root[0].id = 'b1';
  b.url += 'x'; fails(s);
  b.url = 'https://example.com/'; b.notes += 'x'; fails(s);
  b.notes = ''; b.keywords[0] += 'x'; fails(s);
  b.keywords = []; b.id = ''; s.library.root[0].id = ''; fails(s);
});

test('failure does not repair dangling links or strip unknown fields', () => {
  const s = bookmarkSnapshot(); s.collections.push(collection());
  s.collections[0].sections[0].items[0].bookmarkId = 'missing';
  const before = structuredClone(s);
  fails(s, 'INVALID_REFERENCE'); assert.deepEqual(s, before);
  Object.assign(s.collections[0].sections[0].items[0], { unknown: 'preserve' });
  const unknown = structuredClone(s); fails(s); assert.deepEqual(s, unknown);
});

test('rejects sparse arrays, accessors, symbols and nonplain objects without executing getters', () => {
  const s = emptySnapshot(); s.trash = new Array(1); fails(s);
  const accessor = emptySnapshot();
  Object.defineProperty(accessor, 'trash', { enumerable: true, get() { throw new Error('must not execute'); } });
  fails(accessor);
  const symbol = emptySnapshot(); Object.assign(symbol, { [Symbol('hidden')]: 1 }); fails(symbol);
  const custom = Object.assign(Object.create({}), emptySnapshot()); fails(custom);
});
