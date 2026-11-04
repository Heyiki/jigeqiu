import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssetSnapshot, Collection, ErrorCode, Result } from '../../src/domain/assets/model';
import type { ImportContext, ImportDocument, ImportNode, ImportOptions } from '../../src/services/import-export/model';
import { ASSET_LIMITS, captureJsonInput, validateSnapshot } from '../../src/domain/assets/validation';
import { previewImport } from '../../src/services/import-export/preview';
import { bookmarkSnapshot, emptySnapshot } from '../support/asset-fixtures';

function doc(roots: ImportNode[] = [], collections: Collection[] = []): ImportDocument {
  return { format: 'json', roots, collections, notices: [] };
}
function mark(sourceId: string, url = 'https://example.com/'): ImportNode {
  return { kind: 'bookmark', sourceId, input: {
    title: sourceId, url, icon: null, notes: 'private', keywords: ['source'],
  } };
}
function folder(sourceId: string, children: ImportNode[] = [], name = 'Same'): ImportNode {
  return { kind: 'folder', sourceId, name, children };
}
function collection(id = 'source-c', bookmarkId: string | null = null): Collection {
  return { id, title: 'List', description: 'Body', cover: null,
    provenance: [{ sourceId: 'remote', title: 'Original', author: null, url: null }],
    sections: [{ id: `${id}-s`, title: 'Section', description: '', items: [{
      id: `${id}-i`, bookmarkId, title: 'Independent', url: 'https://snapshot.example/',
      icon: null, recommendationReason: 'Exact reason',
    }] }], createdAt: 10, updatedAt: 11 };
}
function options(patch: Partial<ImportOptions> = {}): ImportOptions {
  return { target: { kind: 'existing', folderId: null }, duplicateBookmarks: 'skip',
    duplicateCollections: 'skip-identical', folderBindings: [],
    missingParents: 'reject', missingBookmarkLinks: 'reject', ...patch };
}
function context(base = emptySnapshot(), candidateIds = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6']): ImportContext {
  return { base, expected: { storeId: 'store', revision: 1, commitId: 'old' },
    previewId: 'preview', at: 123, candidateIds };
}
function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  assert.equal(result.ok, true);
  return result.value;
}
function fails(document: unknown, opts: unknown = options(), ctx: unknown = context(), code?: ErrorCode) {
  const result = previewImport(document as ImportDocument, opts as ImportOptions, ctx as ImportContext);
  assert.equal(result.ok, false, JSON.stringify(result));
  if (!result.ok && code) assert.equal(result.error.code, code);
}
function addFolder(base: AssetSnapshot, id: string, parent: string | null = null) {
  base.library.folders.push({ id, name: 'Same', children: [], createdAt: 1, updatedAt: 1 });
  const children = parent === null ? base.library.root : base.library.folders.find(f => f.id === parent)!.children;
  children.push({ kind: 'folder', id });
}

test('allocates container first, then mixed library preorder and collection/section/item; no sentinel mapping', () => {
  const document = doc([folder('sf', [mark('sb')]), folder('empty')], [collection()]);
  const result = value(previewImport(document, options({ target: { kind: 'new-container', name: 'Import' } }),
    context(emptySnapshot(), ['container', 'f', 'b', 'empty', 'c', 's', 'i'])));
  assert.equal(result.previewId, 'preview');
  assert.deepEqual(result.expected, context().expected);
  assert.deepEqual(result.mappings.map(m => [m.sourceId, m.targetId, m.disposition]), [
    ['sf', 'f', 'created'], ['sb', 'b', 'created'], ['empty', 'empty', 'created'],
    ['source-c', 'c', 'created'], ['source-c-s', 's', 'created'], ['source-c-i', 'i', 'created'],
  ]);
  assert.deepEqual(result.counts, { created: 7, skipped: 0, invalid: 0 });
  assert.deepEqual(result.next.library.root, [{ kind: 'folder', id: 'container' }]);
  assert.deepEqual(result.next.library.folders[0].children, [{ kind: 'folder', id: 'f' }, { kind: 'folder', id: 'empty' }]);
  assert.equal(result.next.library.bookmarks[0].createdAt, 123);
  assert.equal(result.next.collections[0].updatedAt, 123);
  assert.equal(validateSnapshot(result.next).ok, true);
});

test('captures independent inputs and deterministic output without mutation, clock, or random IDs', () => {
  const document = doc([mark('source')]); document.notices.push({ code: 'PARSED', details: { count: 1 } });
  const opts = options(); const ctx = context(bookmarkSnapshot());
  const before = structuredClone({ document, opts, ctx });
  const first = value(previewImport(document, opts, ctx));
  assert.deepEqual(first, value(previewImport(document, opts, ctx)));
  assert.deepEqual({ document, opts, ctx }, before);
  document.roots.length = 0; opts.folderBindings.push({ sourceId: 'x', existingId: 'y' });
  ctx.base.library.bookmarks[0].notes = 'changed'; ctx.expected!.commitId = 'changed';
  assert.deepEqual(first.document, before.document);
  assert.deepEqual(first.options, before.opts);
  assert.deepEqual(first.expected, before.ctx.expected);
  assert.deepEqual(first.next.library.bookmarks[0], before.ctx.base.library.bookmarks[0]);
  assert.ok(first.notices.some(n => n.code === 'PARSED'));
});

test('same-name and empty folders remain distinct with stable mixed order appended to the target', () => {
  const base = bookmarkSnapshot(); addFolder(base, 'local-f');
  const result = value(previewImport(doc([folder('a'), mark('b'), folder('c')]), options(), context(base)));
  assert.deepEqual(result.next.library.root, [
    ...base.library.root, { kind: 'folder', id: 'n1' }, { kind: 'folder', id: 'n2' },
  ]);
  assert.deepEqual(result.next.library.folders.slice(1).map(f => [f.name, f.children]), [['Same', []], ['Same', []]]);
  assert.equal(result.mappings[1].targetId, 'b1');
  assert.deepEqual(result.counts, { created: 2, skipped: 1, invalid: 0 });
});

test('bindings require explicit existing identity under the mapped parent and append without changing locals', () => {
  const base = bookmarkSnapshot(); addFolder(base, 'local'); addFolder(base, 'child', 'local');
  base.library.folders[0].children.unshift(base.library.root.shift()!);
  const opts = options({ folderBindings: [
    { sourceId: 'source', existingId: 'local' }, { sourceId: 'nested', existingId: 'child' },
  ] });
  const result = value(previewImport(doc([folder('source', [
    folder('nested'), mark('new', 'https://different.example/'),
  ])]), opts, context(base, ['only'])));
  assert.deepEqual(result.next.library.folders[0].children, [
    ...base.library.folders[0].children, { kind: 'bookmark', id: 'only' },
  ]);
  assert.deepEqual(result.next.library.bookmarks[0], base.library.bookmarks[0]);
  assert.deepEqual(result.counts, { created: 1, skipped: 2, invalid: 0 });
});

test('rejects wrong-parent, repeated-target, repeated-source, nonexistent and bookmark bindings', () => {
  const base = bookmarkSnapshot(); addFolder(base, 'local'); addFolder(base, 'child', 'local');
  const document = doc([folder('a', [folder('b')]), folder('c')]);
  for (const folderBindings of [
    [{ sourceId: 'a', existingId: 'child' }],
    [{ sourceId: 'a', existingId: 'local' }, { sourceId: 'c', existingId: 'local' }],
    [{ sourceId: 'a', existingId: 'local' }, { sourceId: 'a', existingId: 'child' }],
    [{ sourceId: 'missing', existingId: 'local' }],
    [{ sourceId: 'a', existingId: 'missing' }],
    [{ sourceId: 'a', existingId: 'b1' }],
    [{ sourceId: 'a', existingId: 'local' }, { sourceId: 'b', existingId: 'local' }],
  ]) fails(document, options({ folderBindings }), context(base));
  fails(doc([mark('a')]), options({ folderBindings: [{ sourceId: 'a', existingId: 'local' }] }), context(base));
});

test('dedup uses first mixed-order match and planned bookmarks while preserving local fields and item body', () => {
  const base = bookmarkSnapshot();
  base.library.bookmarks.push({ ...base.library.bookmarks[0], id: 'second', title: 'Second' });
  base.library.root.unshift({ kind: 'bookmark', id: 'second' });
  const result = value(previewImport(doc([
    mark('a', 'https://EXAMPLE.com:443/'), mark('b', 'https://new.example/'),
    mark('c', 'https://new.example/'),
  ], [collection('sc', 'c')]), options(), context(base, ['new', 'col', 'sec', 'item'])));
  assert.deepEqual(result.mappings.slice(0, 3).map(m => [m.targetId, m.disposition]), [
    ['second', 'existing'], ['new', 'created'], ['new', 'existing'],
  ]);
  assert.deepEqual(result.next.library.bookmarks.slice(0, 2), base.library.bookmarks);
  assert.deepEqual(result.next.collections[0].sections[0].items[0], {
    ...collection('sc', 'c').sections[0].items[0], id: 'item', bookmarkId: 'new',
  });
  assert.deepEqual(result.counts, { created: 4, skipped: 2, invalid: 0 });
  assert.ok(result.notices.some(n => n.details.sourceId === 'a'
    && Array.isArray(n.details.candidateIds) && n.details.candidateIds.length === 2));
});

test('conservative URL keys keep protocols, www, nondefault ports, slash, case, query order and fragments distinct', () => {
  const urls = ['http://example.com/', 'https://www.example.com/', 'https://example.com:444/',
    'https://example.com/A', 'https://example.com/a', 'https://example.com/a/',
    'https://example.com/?a=1&b=2', 'https://example.com/?b=2&a=1', 'https://example.com/#x'];
  const result = value(previewImport(doc(urls.map((url, i) => mark(`s${i}`, url))),
    options(), context(bookmarkSnapshot(), urls.map((_, i) => `n${i}`))));
  assert.equal(result.counts.created, urls.length);
  assert.deepEqual(result.next.library.bookmarks.slice(1).map(b => b.url), urls);
});

test('normalizes import bookmark URLs only by trimming and supplying HTTPS, never rewriting their stored spelling', () => {
  const urls = [' EXAMPLE.com:443/A?b=2&a=1#X ', ' HTTPS://EXAMPLE.com:443/A '];
  const result = value(previewImport(doc(urls.map((url, i) => mark(`s${i}`, url))),
    options(), context()));
  assert.deepEqual(result.next.library.bookmarks.map(b => b.url),
    ['https://EXAMPLE.com:443/A?b=2&a=1#X', 'HTTPS://EXAMPLE.com:443/A']);
  for (const url of ['javascript:alert(1)', 'ftp://example.com/', 'data:text/plain,x', 'https://', 'https://a b/']) {
    fails(doc([mark('bad', url)]), options(), context(), 'INVALID_URL');
  }
});

test('keep and new-container do not dedup against the old root, and separate folders do not cross-dedup', () => {
  const base = bookmarkSnapshot();
  assert.equal(value(previewImport(doc([mark('s')]), options({ duplicateBookmarks: 'keep' }),
    context(base))).counts.created, 1);
  const result = value(previewImport(doc([mark('a'), folder('f', [mark('b')])]),
    options({ target: { kind: 'new-container', name: '' } }), context(base)));
  assert.deepEqual(result.counts, { created: 4, skipped: 0, invalid: 0 });
});

test('identical collection ignores IDs, timestamps and links, maps sections/items by position, and keeps locals', () => {
  const base = bookmarkSnapshot(); const local = collection('local', 'b1'); base.collections.push(local);
  const source = collection('source', 'sb'); source.createdAt = 999;
  const result = value(previewImport(doc([mark('sb')], [source]), options(), context(base, [])));
  assert.deepEqual(result.mappings.map(m => [m.kind, m.targetId, m.disposition]), [
    ['bookmark', 'b1', 'existing'], ['collection', 'local', 'existing'],
    ['section', 'local-s', 'existing'], ['item', 'local-i', 'existing'],
  ]);
  assert.deepEqual(result.next, base);
  assert.deepEqual(result.counts, { created: 0, skipped: 4, invalid: 0 });
});

test('collection comparison is ordered and exact on body, cover, whitespace and provenance, not object key order', () => {
  const base = emptySnapshot(); base.collections.push(collection('local'));
  for (const mutate of [
    (c: Collection) => { c.provenance[0].author = 'Other'; },
    (c: Collection) => { c.description += ' '; },
    (c: Collection) => { c.sections[0].items[0].recommendationReason += ' '; },
    (c: Collection) => { c.cover = { kind: 'symbol', symbol: 'X', color: 'red' }; },
    (c: Collection) => { c.sections[0].title += ' '; },
  ]) {
    const source = collection(); mutate(source);
    assert.equal(value(previewImport(doc([], [source]), options(), context(base))).counts.created, 3);
  }
  const source = collection();
  source.provenance[0] = { url: null, author: null, title: 'Original', sourceId: 'remote' };
  assert.equal(value(previewImport(doc([], [source]), options(), context(base, []))).counts.skipped, 3);
  assert.equal(value(previewImport(doc([], [source]), options({ duplicateCollections: 'keep' }),
    context(base))).counts.created, 3);
});

test('later identical planned collections map to earlier allocated collection/section/item without extra IDs', () => {
  const result = value(previewImport(doc([], [collection('a'), collection('b')]), options(),
    context(emptySnapshot(), ['c', 's', 'i'])));
  assert.deepEqual(result.counts, { created: 3, skipped: 3, invalid: 0 });
  assert.deepEqual(result.mappings.slice(3).map(m => m.targetId), ['c', 's', 'i']);
});

test('dangling links reject by default even for identical skipped collections; explicit detach emits details', () => {
  const base = bookmarkSnapshot(); base.collections.push(collection('local'));
  const document = doc([], [collection('source', 'missing')]);
  fails(document, options(), context(base), 'INVALID_REFERENCE');
  const result = value(previewImport(document, options({ missingBookmarkLinks: 'detach' }), context(base)));
  assert.ok(result.notices.some(n => n.details.bookmarkId === 'missing' && n.details.itemId === 'source-i'));
  assert.deepEqual(result.next, base);
  const created = value(previewImport(document, options({ missingBookmarkLinks: 'detach' }), context()));
  assert.equal(created.next.collections[0].sections[0].items[0].bookmarkId, null);
  fails(doc([], [collection('source', 'b1')]), options(), context(base), 'INVALID_REFERENCE');
});

test('missing target requires explicit root decision and notice; existing wrong-kind target is not treated as missing', () => {
  const target = { kind: 'existing', folderId: 'gone' } as const;
  fails(doc([mark('s')]), options({ target }), context(), 'INVALID_REFERENCE');
  const result = value(previewImport(doc([mark('s')]), options({ target, missingParents: 'root' }), context()));
  assert.deepEqual(result.next.library.root, [{ kind: 'bookmark', id: 'n1' }]);
  assert.ok(result.notices.some(n => n.details.folderId === 'gone'));
  fails(doc(), options({ target: { kind: 'existing', folderId: 'b1' }, missingParents: 'root' }),
    context(bookmarkSnapshot()), 'INVALID_REFERENCE');
});

test('candidate exhaustion and collisions reject atomically, including every trash and layout ID', () => {
  fails(doc([folder('s', [mark('b')])]), options(), context(emptySnapshot(), ['one']));
  fails(doc([folder('s'), mark('b')]), options(), context(emptySnapshot(), ['same', 'same']), 'ID_COLLISION');
  const base = bookmarkSnapshot();
  base.layout.shortcuts.push({ id: 'shortcut', bookmarkId: 'b1' });
  base.layout.root.push({ kind: 'shortcut', id: 'shortcut' });
  base.layout.dock.push({ id: 'pin', bookmarkId: 'b1' });
  base.trash.push({ id: 'trash', deletedAt: 2, origin: null,
    payload: { kind: 'collection', index: 0, collection: collection('deleted') } });
  for (const id of ['b1', 'shortcut', 'pin', 'trash', 'deleted', 'deleted-s', 'deleted-i']) {
    fails(doc([folder('s')]), options(), context(base, [id]), 'ID_COLLISION');
  }
  for (const id of ['', ' ', 'x'.repeat(257), 123, null]) {
    fails(doc(), options(), { ...context(), candidateIds: [id] });
  }
  assert.equal(value(previewImport(doc([mark('s')]), options(), context(bookmarkSnapshot(), []))).counts.skipped, 1);
});

test('source IDs may equal local IDs but must be globally unique across all source entities', () => {
  assert.equal(value(previewImport(doc([mark('b1', 'https://different.example/')]), options(),
    context(bookmarkSnapshot()))).mappings[0].targetId, 'n1');
  for (const document of [
    doc([folder('a'), folder('a')]), doc([folder('a', [mark('a')])]),
    doc([mark('source-c')], [collection()]),
    doc([folder('source-c-s')], [collection()]),
    doc([mark('source-c-i')], [collection()]),
    doc([], [collection('c'), collection('c')]),
  ]) fails(document, options(), context(), 'ID_COLLISION');
  const c = collection(); c.sections[0].items[0].id = c.sections[0].id;
  fails(doc([], [c]), options(), context(), 'ID_COLLISION');
  fails(doc([mark('')]));
});

test('full base and output snapshot invariants are validated, not only imported objects', () => {
  const base = bookmarkSnapshot(); base.library.root = [];
  fails(doc(), options(), context(base), 'INVALID_REFERENCE');
  const trash = bookmarkSnapshot();
  trash.trash.push({ id: 't', deletedAt: 1, origin: { parentId: null, index: 0 },
    payload: { kind: 'bookmark', bookmark: structuredClone(trash.library.bookmarks[0]) } });
  fails(doc(), options(), context(trash), 'ID_COLLISION');
  const deep = emptySnapshot();
  for (let i = 0; i < ASSET_LIMITS.libraryDepth; i++) addFolder(deep, `f${i}`, i ? `f${i - 1}` : null);
  fails(doc([folder('source')]), options({ target: { kind: 'existing', folderId: 'f63' } }), context(deep));
});

test('strict context includes exact positive three-field expected revision, valid preview ID and timestamp', () => {
  for (const expected of [{ revision: 1 }, { storeId: 's', revision: 1, commitId: 'c', extra: 1 },
    { storeId: 's', revision: 0, commitId: 'c' }, { storeId: '', revision: 1, commitId: 'c' },
    { storeId: 's', revision: 1.1, commitId: 'c' }, { storeId: 's', revision: 1, commitId: '' }]) {
    fails(doc(), options(), { ...context(), expected });
  }
  for (const patch of [{ at: NaN }, { at: -1 }, { at: 0.1 }, { previewId: '' },
    { previewId: 'old' },
    { extra: 1 }, { candidateIds: undefined }]) fails(doc(), options(), { ...context(), ...patch });
  assert.equal(value(previewImport(doc(), options(), { ...context(), expected: null, at: 0 })).expected, null);
});

test('rejects forged options, unknown document/nested fields and unsafe JSON without invoking getters', () => {
  for (const patch of [{ duplicateBookmarks: 'merge' }, { duplicateCollections: 'skip' }, { missingParents: 'guess' },
    { missingBookmarkLinks: 'guess' }, { extra: 1 }, { target: { kind: 'existing', folderId: null, extra: 1 } },
    { folderBindings: [{ sourceId: 'a', existingId: 'b', extra: 1 }] }]) fails(doc(), { ...options(), ...patch });
  for (const document of [null, {}, { ...doc(), extra: 1 }, { ...doc(), format: 'csv' },
    { ...doc(), roots: [{ ...mark('s'), extra: 1 }] },
    { ...doc(), roots: [{ kind: 'folder', sourceId: 's', name: '', children: [], extra: 1 }] },
    { ...doc(), notices: [{ code: 'X', details: {}, extra: true }] }]) fails(document);
  const c = collection(); Object.assign(c.sections[0].items[0], { extra: 1 }); fails(doc([], [c]));
  const node = mark('s'); if (node.kind === 'bookmark') Object.assign(node.input, { extra: 1 }); fails(doc([node]));
  let reads = 0;
  const getter = doc(); Object.defineProperty(getter, 'roots', { enumerable: true, get() { reads++; return []; } });
  fails(getter); assert.equal(reads, 0);
  fails(new Proxy(doc(), {}));
  fails(doc(), new Proxy(options(), {}));
  fails(doc(), options(), new Proxy(context(), {}));
  fails({ ...doc(), notices: new Array(1) });
  fails({ ...doc(), notices: [{ code: 'X', details: { invalid: undefined } }] });
  fails({ ...doc(), notices: [{ code: 'X', details: new Date() }] });
});

test('cyclic and over-budget recursive trees explicitly reject rather than truncate', () => {
  const cyclic = folder('cyclic');
  if (cyclic.kind === 'folder') cyclic.children.push(cyclic);
  fails(doc([cyclic]));
  let tree = folder('last');
  for (let i = 0; i < 64; i++) tree = folder(`f${i}`, [tree]);
  fails(doc([tree]));
  const over = doc([folder('f')]);
  over.roots = Array.from({ length: ASSET_LIMITS.arrayLength + 1 }, (_, i) => folder(`f${i}`));
  fails(over);
});

test('supports a full 64-folder source tree without JSON capture truncation', () => {
  let tree = folder('last');
  for (let i = 1; i < ASSET_LIMITS.libraryDepth; i++) tree = folder(`f${i}`, [tree]);
  const result = value(previewImport(doc([tree]), options(),
    context(emptySnapshot(), Array.from({ length: 64 }, (_, i) => `new${i}`))));
  assert.equal(result.next.library.folders.length, 64);
  assert.equal(result.mappings.length, 64);
  assert.equal(validateSnapshot(result.next).ok, true);
});

test('collection equality preserves section/item/provenance order and all snapshot fields', () => {
  const base = emptySnapshot(); const local = collection('local');
  local.provenance.push({ sourceId: 'remote-2', title: null, author: 'Author', url: null });
  local.sections[0].items.push({
    ...local.sections[0].items[0], id: 'local-i2', title: 'Second',
    icon: { kind: 'monogram', value: 'X', color: 'red' },
  });
  local.sections.push({ id: 'local-s2', title: 'Second section', description: '', items: [] });
  base.collections.push(local);
  for (const mutate of [
    (c: Collection) => { c.provenance.reverse(); },
    (c: Collection) => { c.sections.reverse(); },
    (c: Collection) => { c.sections[0].items.reverse(); },
    (c: Collection) => { c.sections[0].items[1].icon!.color = 'blue'; },
    (c: Collection) => { c.sections[0].description = 'Changed'; },
    (c: Collection) => { c.sections[0].items[0].url += '#changed'; },
  ]) {
    const source = structuredClone(local); mutate(source);
    assert.equal(value(previewImport(doc([], [source]), options(), context(base))).counts.created, 5);
  }
});

test('parsed unresolved-link notice is retained and paired with the confirmed detach notice', () => {
  const document = doc([], [collection('source', 'missing')]);
  document.notices.push({ code: 'MISSING_BOOKMARK_LINK', details: {
    collectionId: 'source', sectionId: 'source-s', itemId: 'source-i', bookmarkId: 'missing',
  } });
  fails(document, options(), context(), 'INVALID_REFERENCE');
  const result = value(previewImport(document, options({ missingBookmarkLinks: 'detach' }), context()));
  assert.deepEqual(result.notices[0], document.notices[0]);
  assert.equal(result.notices[1].code, 'IMPORT_BOOKMARK_LINK_DETACHED');
  assert.deepEqual(result.notices[1].details, document.notices[0].details);
});

test('source body validation cannot be bypassed by skip policies or optional link detachment', () => {
  const base = bookmarkSnapshot(); base.collections.push(collection('local'));
  const document = doc([mark('s')], [collection('source')]);
  const invalidBookmark = structuredClone(document);
  if (invalidBookmark.roots[0].kind === 'bookmark') {
    invalidBookmark.roots[0].input.notes = 'x'.repeat(ASSET_LIMITS.textLength + 1);
  }
  fails(invalidBookmark, options(), context(base));
  for (const bookmarkId of ['', ' ', 1, undefined, 'x'.repeat(ASSET_LIMITS.idLength + 1)]) {
    const invalidCollection = structuredClone(document);
    Object.assign(invalidCollection.collections[0].sections[0].items[0], { bookmarkId });
    fails(invalidCollection, options({ missingBookmarkLinks: 'detach' }), context(base));
  }
});

test('unsafe descriptors in options/context and symbol/extra array fields reject without getters', () => {
  let reads = 0;
  const opts = options();
  Object.defineProperty(opts.target, 'folderId', { enumerable: true, get() { reads++; return null; } });
  fails(doc(), opts);
  const ctx = context();
  Object.defineProperty(ctx, 'at', { enumerable: true, get() { reads++; return 123; } });
  fails(doc(), options(), ctx);
  assert.equal(reads, 0);
  const symbol = doc(); Object.assign(symbol, { [Symbol('extra')]: 1 }); fails(symbol);
  const array = doc(); Object.assign(array.roots, { extra: 'field' }); fails(array);
});

test('5000 bookmarks retain source order and planned duplicate mappings without allocating twice', () => {
  const roots = Array.from({ length: 5000 }, (_, i) => mark(`source${i}`, `https://example.com/${i}`));
  roots.push(mark('repeat', 'https://example.com/2500'));
  const ids = Array.from({ length: 5000 }, (_, i) => `target${i}`);
  const result = value(previewImport(doc(roots), options(), context(emptySnapshot(), ids)));
  assert.deepEqual(result.next.library.root.map(ref => ref.id), ids);
  assert.deepEqual(result.counts, { created: 5000, skipped: 1, invalid: 0 });
  assert.deepEqual(result.mappings.at(-1), {
    kind: 'bookmark', sourceId: 'repeat', targetId: 'target2500', disposition: 'existing',
  });
});

test('only containers with appended children are touched, including bound folders; skipped children do not touch', () => {
  const base = bookmarkSnapshot(); addFolder(base, 'target'); addFolder(base, 'bound', 'target');
  base.library.folders[1].children.push(base.library.root.shift()!);
  const opts = options({ target: { kind: 'existing', folderId: 'target' },
    folderBindings: [{ sourceId: 'source', existingId: 'bound' }] });
  const skipped = value(previewImport(doc([folder('source', [mark('duplicate')])]), opts, context(base, [])));
  assert.deepEqual(skipped.next, base);
  const created = value(previewImport(doc([
    folder('source', [mark('new', 'https://new.example/')]), folder('new-folder'),
  ]), opts, context(base)));
  assert.equal(created.next.library.folders[0].updatedAt, 123);
  assert.equal(created.next.library.folders[1].updatedAt, 123);
  assert.equal(created.next.library.folders[0].createdAt, 1);
  assert.equal(created.next.library.folders[1].createdAt, 1);
  assert.deepEqual(created.next.library.bookmarks[0], base.library.bookmarks[0]);
  assert.equal(base.library.folders[0].updatedAt, 1);
  assert.equal(base.library.folders[1].updatedAt, 1);
});

test('skipped collection mapping includes every ordered section/item, even an empty section', () => {
  const base = emptySnapshot(); const local = collection('local');
  local.sections[0].items.push({ ...local.sections[0].items[0], id: 'local-i2' });
  local.sections.push({ id: 'local-empty', title: 'Empty', description: '', items: [] });
  base.collections.push(local);
  const source = structuredClone(local);
  source.id = 'source'; source.sections[0].id = 'source-s';
  source.sections[0].items[0].id = 'source-i'; source.sections[0].items[1].id = 'source-i2';
  source.sections[1].id = 'source-empty';
  const result = value(previewImport(doc([], [source]), options(), context(base, [])));
  assert.deepEqual(result.mappings.map(m => [m.sourceId, m.targetId, m.disposition]), [
    ['source', 'local', 'existing'], ['source-s', 'local-s', 'existing'],
    ['source-i', 'local-i', 'existing'], ['source-i2', 'local-i2', 'existing'],
    ['source-empty', 'local-empty', 'existing'],
  ]);
  assert.deepEqual(result.counts, { created: 0, skipped: 5, invalid: 0 });
  assert.deepEqual(result.next, base);
});

test('giant JSON and aggregate source entity budgets reject without returning partial or truncated candidates', () => {
  const huge = doc();
  huge.notices.push({ code: 'BIG', details: { body: 'x'.repeat(ASSET_LIMITS.bytes) } });
  fails(huge);
  assert.equal((huge.notices[0].details.body as string).length, ASSET_LIMITS.bytes);
  const tooMany = doc(Array.from({ length: ASSET_LIMITS.nodes - 1 }, (_, i) => folder(`f${i}`)), [collection()]);
  fails(tooMany, options(), context(), 'IMPORT_TOO_LARGE');
  assert.equal(tooMany.roots.length, ASSET_LIMITS.nodes - 1);
});

function largePreviewInputs(count: number) {
  const document = doc(Array.from({ length: count }, (_, i) => {
    const node = mark(`source${i}`, `https://example.com/${i}`);
    if (node.kind === 'bookmark') node.input.notes = 'x'.repeat(ASSET_LIMITS.textLength);
    return node;
  }));
  return { document, opts: options(), ctx: context(emptySnapshot(),
    Array.from({ length: count }, (_, i) => `target${i}`)) };
}

test('assembled preview exceeding 16 MiB rejects even when input and candidate snapshot fit, without mutation', () => {
  const { document, opts, ctx } = largePreviewInputs(270);
  const before = structuredClone({ document, opts, ctx });
  assert.equal(captureJsonInput({ document, options: opts, context: ctx }, 144).ok, true);
  const result = previewImport(document, opts, ctx);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'IMPORT_TOO_LARGE');
    assert.equal(result.error.details.reason, 'byte-budget');
  }
  assert.deepEqual({ document, opts, ctx }, before);
});

test('assembled preview near 16 MiB succeeds as a bounded independently captured value without mutation', () => {
  const { document, opts, ctx } = largePreviewInputs(250);
  const before = structuredClone({ document, opts, ctx });
  const result = value(previewImport(document, opts, ctx));
  const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
  assert.ok(bytes > ASSET_LIMITS.bytes * 0.95);
  assert.ok(bytes <= ASSET_LIMITS.bytes);
  assert.equal(captureJsonInput(result, 144).ok, true);
  assert.equal(validateSnapshot(result.next).ok, true);
  assert.deepEqual(result.counts, { created: 250, skipped: 0, invalid: 0 });
  assert.deepEqual({ document, opts, ctx }, before);
  result.document.roots.length = 0;
  result.next.library.bookmarks[0].notes = 'result-only';
  assert.deepEqual({ document, opts, ctx }, before);
});

test('initial input byte and depth budgets also report IMPORT_TOO_LARGE', () => {
  const huge = doc();
  huge.notices.push({ code: 'BIG', details: { body: 'x'.repeat(ASSET_LIMITS.bytes) } });
  fails(huge, options(), context(), 'IMPORT_TOO_LARGE');
  let nested: unknown = null;
  for (let i = 0; i < 145; i++) nested = { nested };
  const deep = doc();
  deep.notices.push({ code: 'DEEP', details: nested as Record<string, null> });
  fails(deep, options(), context(), 'IMPORT_TOO_LARGE');
});
