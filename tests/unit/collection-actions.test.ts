import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCollectionAction } from '../../src/domain/assets/collection-actions';
import type { ActionContext } from '../../src/domain/assets/command-context';
import type { Collection, ErrorCode, Id } from '../../src/domain/assets/model';
import { bookmarkSnapshot } from '../support/asset-fixtures';

function collection(prefix = 'c'): Collection {
  return {
    id: prefix, title: 'Tools', description: 'Useful links',
    cover: { kind: 'symbol', symbol: '*', color: '#ffffff' },
    provenance: [{ sourceId: 'ancestor', title: 'Original', author: 'Author', url: null }],
    sections: [{
      id: `${prefix}-s`, title: 'Read', description: 'First chapter',
      items: [{
        id: `${prefix}-i`, bookmarkId: 'b1', title: 'Snapshot',
        url: 'https://example.com/snapshot',
        icon: { kind: 'monogram', value: 'S', color: null }, recommendationReason: '',
      }],
    }],
    createdAt: 10, updatedAt: 20,
  };
}

function context(collections: Collection[] = [], trashed: Collection[] = []) {
  const snapshot = bookmarkSnapshot();
  snapshot.library.bookmarks[0].notes = 'Private note must stay private';
  snapshot.collections = structuredClone(collections);
  snapshot.trash = structuredClone(trashed).map((entry, index) => ({
    id: `trash-${index}`, deletedAt: 50, origin: null,
    payload: { kind: 'collection', collection: entry, index },
  }));
  const allocated = new Set<Id>();
  function collectIds(value: unknown): void {
    if (Array.isArray(value)) value.forEach(collectIds);
    else if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key === 'id' && typeof child === 'string') allocated.add(child);
        else collectIds(child);
      }
    }
  }
  collectIds(snapshot);
  const claims: Id[] = [];
  const ctx: ActionContext = {
    snapshot, at: 100, affected: new Set(),
    claim(id) {
      if (allocated.has(id)) ctx.reject('ID_COLLISION', { id });
      allocated.add(id);
      claims.push(id);
    },
    reject(code, details = {}) { throw { code, details }; },
  };
  return { ctx, claims };
}

function expectCode(run: () => void, code: ErrorCode) {
  assert.throws(run, (error: unknown) =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === code);
}

function copyOf(source: Collection): Collection {
  const copy = structuredClone(source);
  copy.id = 'copy';
  copy.sections.forEach((section, s) => {
    section.id = `copy-s${s}`;
    section.items.forEach((item, i) => { item.id = `copy-i${s}-${i}`; });
  });
  copy.provenance.push({ sourceId: source.id, title: source.title, author: null, url: null });
  return copy;
}

test('create claims every new ID, uses command timestamps and owns a deep clone', () => {
  const { ctx, claims } = context();
  const input = collection();
  applyCollectionAction(ctx, { type: 'collection.save', mode: 'create', collection: input });
  assert.deepEqual(claims, ['c', 'c-s', 'c-i']);
  assert.deepEqual(ctx.snapshot.collections, [{ ...input, createdAt: 100, updatedAt: 100 }]);
  assert.ok(ctx.affected.has('c'));
  input.sections[0].items[0].icon!.value = 'changed';
  input.provenance[0].author = 'changed';
  input.cover = null;
  assert.equal(ctx.snapshot.collections[0].sections[0].items[0].icon!.value, 'S');
  assert.equal(ctx.snapshot.collections[0].provenance[0].author, 'Author');
  assert.notEqual(ctx.snapshot.collections[0].cover, null);
});

test('update preserves creation time and collection position, retaining same-kind identities', () => {
  const source = collection();
  const { ctx, claims } = context([collection('before'), source, collection('after')]);
  const input = structuredClone(source);
  input.title = 'Edited';
  input.createdAt = 999;
  input.sections.push({ id: 'new-s', title: 'New', description: '', items: [] });
  input.sections[1].items.push(input.sections[0].items.pop()!);
  applyCollectionAction(ctx, { type: 'collection.save', mode: 'update', collection: input });
  assert.deepEqual(claims, ['new-s']);
  assert.deepEqual(ctx.snapshot.collections.map((entry) => entry.id), ['before', 'c', 'after']);
  assert.deepEqual(ctx.snapshot.collections[1], { ...input, createdAt: 10, updatedAt: 100 });
  input.sections[1].items[0].title = 'Mutated';
  assert.equal(ctx.snapshot.collections[1].sections[1].items[0].title, 'Snapshot');
});

test('create cannot overwrite and update requires an active collection', () => {
  const { ctx } = context([collection()]);
  expectCode(() => applyCollectionAction(ctx, {
    type: 'collection.save', mode: 'create', collection: collection(),
  }), 'ID_COLLISION');
  expectCode(() => applyCollectionAction(ctx, {
    type: 'collection.save', mode: 'update', collection: collection('missing'),
  }), 'NOT_FOUND');
});

for (const collision of ['b1', 'other-s', 'other-i', 'deleted-s', 'deleted-i', 'c-i']) {
  test(`update rejects foreign, deleted, or wrong-kind section identity: ${collision}`, () => {
    const { ctx } = context([collection(), collection('other')], [collection('deleted')]);
    const input = collection();
    input.sections[0].id = collision;
    expectCode(() => applyCollectionAction(ctx, {
      type: 'collection.save', mode: 'update', collection: input,
    }), 'ID_COLLISION');
  });
}

for (const collision of ['c-s', 'other-s', 'other-i', 'deleted-i', 'b1']) {
  test(`update rejects foreign or wrong-kind item identity: ${collision}`, () => {
    const { ctx } = context([collection(), collection('other')], [collection('deleted')]);
    const input = collection();
    input.sections[0].items[0].id = collision;
    expectCode(() => applyCollectionAction(ctx, {
      type: 'collection.save', mode: 'update', collection: input,
    }), 'ID_COLLISION');
  });
}

test('update rejects duplicate retained section and item identities', () => {
  for (const kind of ['section', 'item']) {
    const { ctx } = context([collection()]);
    const input = collection();
    if (kind === 'section') input.sections.push(structuredClone(input.sections[0]));
    else input.sections[0].items.push(structuredClone(input.sections[0].items[0]));
    expectCode(() => applyCollectionAction(ctx, {
      type: 'collection.save', mode: 'update', collection: input,
    }), 'ID_COLLISION');
  }
});

test('create reserves its new IDs against subsequent actions in the batch', () => {
  const { ctx } = context();
  applyCollectionAction(ctx, { type: 'collection.save', mode: 'create', collection: collection() });
  const input = collection('second');
  input.sections[0].items[0].id = 'c-i';
  expectCode(() => applyCollectionAction(ctx, {
    type: 'collection.save', mode: 'create', collection: input,
  }), 'ID_COLLISION');
});

test('update claims newly added item IDs and cannot revive an item removed earlier in the batch', () => {
  const { ctx, claims } = context([collection()]);
  const first = collection();
  first.sections[0].items.push({ ...first.sections[0].items[0], id: 'new-item' });
  applyCollectionAction(ctx, { type: 'collection.save', mode: 'update', collection: first });
  assert.deepEqual(claims, ['new-item']);
  const removed = structuredClone(ctx.snapshot.collections[0]);
  removed.sections[0].items = [];
  applyCollectionAction(ctx, { type: 'collection.save', mode: 'update', collection: removed });
  expectCode(() => applyCollectionAction(ctx, {
    type: 'collection.save', mode: 'update', collection: first,
  }), 'ID_COLLISION');
});

test('copy preserves body, associations and ordered provenance, without private notes or aliases', () => {
  const source = collection();
  const { ctx, claims } = context([source]);
  const copy = copyOf(source);
  applyCollectionAction(ctx, { type: 'collection.copy', sourceId: source.id, copy });
  assert.deepEqual(claims, ['copy', 'copy-s0', 'copy-i0-0']);
  assert.deepEqual(ctx.snapshot.collections[1], { ...copy, createdAt: 100, updatedAt: 100 });
  assert.deepEqual(ctx.snapshot.collections[0], source);
  assert.equal(ctx.snapshot.collections[1].sections[0].items[0].recommendationReason, '');
  copy.sections[0].items[0].icon!.value = 'changed';
  copy.provenance[0].author = 'changed';
  assert.equal(ctx.snapshot.collections[1].sections[0].items[0].icon!.value, 'S');
  assert.equal(ctx.snapshot.collections[1].provenance[0].author, 'Author');
  ctx.snapshot.collections[0].sections[0].title = 'source edited';
  assert.equal(ctx.snapshot.collections[1].sections[0].title, 'Read');
});

const bodyChanges: [string, (copy: Collection) => void][] = [
  ['title', (copy) => { copy.title += '!'; }],
  ['description', (copy) => { copy.description += '!'; }],
  ['cover', (copy) => { copy.cover = null; }],
  ['section title', (copy) => { copy.sections[0].title += '!'; }],
  ['section description', (copy) => { copy.sections[0].description += '!'; }],
  ['section count', (copy) => { copy.sections = []; }],
  ['item title', (copy) => { copy.sections[0].items[0].title += '!'; }],
  ['item URL', (copy) => { copy.sections[0].items[0].url += '/changed'; }],
  ['item icon', (copy) => { copy.sections[0].items[0].icon!.color = '#000000'; }],
  ['recommendation', (copy) => { copy.sections[0].items[0].recommendationReason = 'Private note'; }],
  ['bookmark link', (copy) => { copy.sections[0].items[0].bookmarkId = null; }],
  ['item count', (copy) => { copy.sections[0].items = []; }],
  ['removed provenance', (copy) => { copy.provenance.shift(); }],
  ['edited provenance', (copy) => { copy.provenance[0].author = null; }],
  ['reordered provenance', (copy) => { copy.provenance.reverse(); }],
  ['forged appended provenance', (copy) => { copy.provenance[1].title = 'Forged'; }],
];
for (const [field, mutate] of bodyChanges) {
  test(`copy rejects changed ${field}`, () => {
    const source = collection();
    const { ctx } = context([source]);
    const copy = copyOf(source);
    mutate(copy);
    expectCode(() => applyCollectionAction(ctx, {
      type: 'collection.copy', sourceId: source.id, copy,
    }), 'INVALID_INPUT');
  });
}

test('copy rejects reordered chapters and items', () => {
  const source = collection();
  source.sections[0].items.push({
    ...structuredClone(source.sections[0].items[0]), id: 'second-item', title: 'Second item',
  });
  source.sections.push({
    id: 'second-section', title: 'Second chapter', description: '', items: [],
  });
  for (const kind of ['section', 'item']) {
    const { ctx } = context([source]);
    const copy = copyOf(source);
    if (kind === 'section') copy.sections.reverse();
    else copy.sections[0].items.reverse();
    expectCode(() => applyCollectionAction(ctx, {
      type: 'collection.copy', sourceId: source.id, copy,
    }), 'INVALID_INPUT');
  }
});

test('copy supports URL covers and null icons without relying on object key order', () => {
  const source = collection();
  source.cover = { kind: 'url', url: 'https://example.com/cover.png' };
  source.sections[0].items[0].icon = null;
  const { ctx } = context([source]);
  const copy = copyOf(source);
  copy.cover = { url: 'https://example.com/cover.png', kind: 'url' };
  copy.provenance[0] = { url: null, author: 'Author', title: 'Original', sourceId: 'ancestor' };
  applyCollectionAction(ctx, { type: 'collection.copy', sourceId: source.id, copy });
  assert.deepEqual(ctx.snapshot.collections[1], { ...copy, createdAt: 100, updatedAt: 100 });
});

for (const target of ['collection', 'section', 'item'] as const) {
  test(`copy requires a fresh ${target} ID`, () => {
    const source = collection();
    const { ctx } = context([source]);
    const copy = copyOf(source);
    if (target === 'collection') copy.id = source.id;
    if (target === 'section') copy.sections[0].id = source.sections[0].id;
    if (target === 'item') copy.sections[0].items[0].id = source.sections[0].items[0].id;
    expectCode(() => applyCollectionAction(ctx, {
      type: 'collection.copy', sourceId: source.id, copy,
    }), 'ID_COLLISION');
  });
}

test('copy requires an active source', () => {
  const { ctx } = context();
  expectCode(() => applyCollectionAction(ctx, {
    type: 'collection.copy', sourceId: 'missing', copy: copyOf(collection()),
  }), 'NOT_FOUND');
});

test('trash moves the collection with its original index and claims only the trash ID', () => {
  const source = collection();
  const { ctx, claims } = context([collection('before'), source, collection('after')]);
  applyCollectionAction(ctx, { type: 'collection.trash', id: source.id, trashId: 'trash' });
  assert.deepEqual(claims, ['trash']);
  assert.deepEqual(ctx.snapshot.collections.map((entry) => entry.id), ['before', 'after']);
  assert.deepEqual(ctx.snapshot.trash, [{
    id: 'trash', deletedAt: 100, origin: null,
    payload: { kind: 'collection', collection: source, index: 1 },
  }]);
  assert.ok(ctx.affected.has('c'));
  assert.ok(ctx.affected.has('trash'));
  assert.equal(ctx.snapshot.library.bookmarks.length, 1);
  expectCode(() => applyCollectionAction(ctx, {
    type: 'collection.trash', id: source.id, trashId: 'another',
  }), 'NOT_FOUND');
});

test('trash rejects an occupied trash ID', () => {
  const { ctx } = context([collection()]);
  expectCode(() => applyCollectionAction(ctx, {
    type: 'collection.trash', id: 'c', trashId: 'c-i',
  }), 'ID_COLLISION');
});
