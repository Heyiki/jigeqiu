import assert from 'node:assert/strict';
import test from 'node:test';
import type { ActionContext } from '../../src/domain/assets/command-context';
import type { AssetAction } from '../../src/domain/assets/commands';
import { applyLayoutAction } from '../../src/domain/assets/layout-actions';
import type { AssetSnapshot, ErrorCode, Json } from '../../src/domain/assets/model';
import { validateSnapshot } from '../../src/domain/assets/validation';
import { bookmarkSnapshot } from '../support/asset-fixtures';

type LayoutAction = Extract<AssetAction, { type: `desktop.${string}` | `dock.${string}` }>;

class DomainFailure extends Error {
  constructor(readonly code: ErrorCode, readonly details: { [key: string]: Json } = {}) {
    super(code);
  }
}

function fixture(): AssetSnapshot {
  const snapshot = bookmarkSnapshot();
  const first = snapshot.library.bookmarks[0];
  for (const id of ['b2', 'b3', 'b4']) {
    snapshot.library.bookmarks.push({ ...structuredClone(first), id });
    snapshot.library.root.push({ kind: 'bookmark', id });
  }
  snapshot.layout = {
    shortcuts: [
      { id: 's1', bookmarkId: 'b1' }, { id: 's2', bookmarkId: 'b2' },
      { id: 's3', bookmarkId: 'b3' },
    ],
    folders: [
      { id: 'g1', name: 'First', shortcutIds: ['s2'] },
      { id: 'g2', name: 'Second', shortcutIds: [] },
    ],
    root: [
      { kind: 'shortcut', id: 's1' }, { kind: 'desktop-folder', id: 'g1' },
      { kind: 'shortcut', id: 's3' }, { kind: 'desktop-folder', id: 'g2' },
    ],
    dock: [{ id: 'p1', bookmarkId: 'b1' }, { id: 'p2', bookmarkId: 'b2' }],
  };
  assert.equal(validateSnapshot(snapshot).ok, true);
  return snapshot;
}

function context(base: AssetSnapshot): ActionContext {
  const claimed = new Set<string>();
  // Walk entities, not references; include nested collection/trash IDs in the boundary.
  function collect(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if ('id' in value && typeof value.id === 'string') claimed.add(value.id);
    for (const nested of Object.values(value)) collect(nested);
  }
  collect(base);
  return {
    snapshot: structuredClone(base), at: 50, affected: new Set(),
    claim(id) {
      if (typeof id !== 'string' || !id.trim()) throw new DomainFailure('INVALID_INPUT');
      if (claimed.has(id)) throw new DomainFailure('ID_COLLISION', { id });
      claimed.add(id);
    },
    reject(code, details) { throw new DomainFailure(code, details); },
  };
}

function run(actions: LayoutAction[], base = fixture()): ActionContext {
  const original = structuredClone(base);
  const ctx = context(base);
  for (const action of actions) {
    const input = structuredClone(action);
    applyLayoutAction(ctx, action);
    assert.deepEqual(action, input, 'action must not be mutated');
    assert.equal(validateSnapshot(ctx.snapshot).ok, true, JSON.stringify(action));
    assert.deepEqual(ctx.snapshot.library, original.library, 'library must remain unchanged');
    assert.deepEqual(ctx.snapshot.collections, original.collections);
    assert.deepEqual(ctx.snapshot.trash, original.trash);
  }
  assert.deepEqual(base, original, 'caller snapshot must remain unchanged');
  return ctx;
}

function rejects(action: LayoutAction, code: ErrorCode, base = fixture()): void {
  const original = structuredClone(base);
  assert.throws(() => applyLayoutAction(context(base), action),
    (error: unknown) => error instanceof DomainFailure && error.code === code);
  assert.deepEqual(base, original);
}

test('desktop pin creates a shortcut at root and in a folder without touching Dock', () => {
  const root = run([{ type: 'desktop.pin', bookmarkId: 'b4', shortcutId: 's4',
    to: { kind: 'root', index: 1 } }]);
  assert.deepEqual(root.snapshot.layout.root[1], { kind: 'shortcut', id: 's4' });
  assert.deepEqual(root.snapshot.layout.shortcuts.at(-1), { id: 's4', bookmarkId: 'b4' });
  assert.deepEqual(root.snapshot.layout.dock, fixture().layout.dock);
  assert.ok(root.affected.has('s4'));
  const grouped = run([{ type: 'desktop.pin', bookmarkId: 'b4', shortcutId: 's4',
    to: { kind: 'folder', folderId: 'g1', index: 1 } }]);
  assert.deepEqual(grouped.snapshot.layout.folders[0].shortcutIds, ['s2', 's4']);
  assert.ok(grouped.affected.has('g1'));
});

test('desktop pin is globally idempotent, reports existing ID and does not consume unused ID', () => {
  const ctx = run([
    { type: 'desktop.pin', bookmarkId: 'b2', shortcutId: 'unused',
      to: { kind: 'root', index: 0 } },
    { type: 'desktop.folder.create', id: 'unused', name: 'Empty', shortcutIds: [], index: 4 },
  ]);
  assert.ok(ctx.affected.has('s2'));
  assert.deepEqual(ctx.snapshot.layout.folders[0].shortcutIds, ['s2']);
  assert.equal(ctx.snapshot.layout.shortcuts.length, 3);
  assert.deepEqual(ctx.snapshot.layout.root.at(-1), { kind: 'desktop-folder', id: 'unused' });
});

test('desktop unpin removes only the entry and preserves empty folder and Dock', () => {
  const ctx = run([
    { type: 'desktop.unpin', bookmarkId: 'b2' },
    { type: 'desktop.unpin', bookmarkId: 'b1' },
    { type: 'desktop.unpin', bookmarkId: 'b1' },
  ]);
  assert.deepEqual(ctx.snapshot.layout.shortcuts, [{ id: 's3', bookmarkId: 'b3' }]);
  assert.deepEqual(ctx.snapshot.layout.folders[0].shortcutIds, []);
  assert.deepEqual(ctx.snapshot.layout.root.map(ref => ref.id), ['g1', 's3', 'g2']);
  assert.deepEqual(ctx.snapshot.layout.dock, fixture().layout.dock);
  assert.ok(ctx.affected.has('s2'));
  assert.ok(ctx.affected.has('g1'));
});

test('folder create moves existing shortcuts in requested order and uses post-removal root index', () => {
  const ctx = run([{ type: 'desktop.folder.create', id: 'g3', name: 'New',
    shortcutIds: ['s3', 's2', 's1'], index: 1 }]);
  assert.deepEqual(ctx.snapshot.layout.root.map(ref => ref.id), ['g1', 'g3', 'g2']);
  assert.deepEqual(ctx.snapshot.layout.folders.at(-1),
    { id: 'g3', name: 'New', shortcutIds: ['s3', 's2', 's1'] });
  assert.deepEqual(ctx.snapshot.layout.folders[0].shortcutIds, []);
  assert.equal(ctx.snapshot.layout.shortcuts.length, 3);
});

test('empty groups survive creation, rename and dissolving another empty group', () => {
  const ctx = run([
    { type: 'desktop.folder.create', id: 'g3', name: 'Empty', shortcutIds: [], index: 0 },
    { type: 'desktop.folder.rename', id: 'g3', name: 'Renamed' },
    { type: 'desktop.folder.remove', id: 'g2', mode: 'dissolve' },
  ]);
  assert.equal(ctx.snapshot.layout.folders.find(folder => folder.id === 'g3')?.name, 'Renamed');
  assert.equal(ctx.snapshot.layout.folders.some(folder => folder.id === 'g2'), false);
  assert.equal(ctx.snapshot.layout.root[0].id, 'g3');
});

for (const [label, ref, to, expectedRoot, expectedFirst, expectedSecond] of [
  ['root forward', { kind: 'shortcut', id: 's1' }, { kind: 'root', index: 3 },
    ['g1', 's3', 'g2', 's1'], ['s2'], []],
  ['root backward', { kind: 'shortcut', id: 's3' }, { kind: 'root', index: 0 },
    ['s3', 's1', 'g1', 'g2'], ['s2'], []],
  ['root to folder', { kind: 'shortcut', id: 's1' }, { kind: 'folder', folderId: 'g1', index: 1 },
    ['g1', 's3', 'g2'], ['s2', 's1'], []],
  ['folder to root', { kind: 'shortcut', id: 's2' }, { kind: 'root', index: 4 },
    ['s1', 'g1', 's3', 'g2', 's2'], [], []],
  ['between folders', { kind: 'shortcut', id: 's2' }, { kind: 'folder', folderId: 'g2', index: 0 },
    ['s1', 'g1', 's3', 'g2'], [], ['s2']],
  ['folder root move', { kind: 'desktop-folder', id: 'g1' }, { kind: 'root', index: 3 },
    ['s1', 's3', 'g2', 'g1'], ['s2'], []],
] as const) {
  test(`desktop move: ${label}`, () => {
    const ctx = run([{ type: 'desktop.move', ref, to }]);
    assert.deepEqual(ctx.snapshot.layout.root.map(item => item.id), expectedRoot);
    assert.deepEqual(ctx.snapshot.layout.folders[0].shortcutIds, expectedFirst);
    assert.deepEqual(ctx.snapshot.layout.folders[1].shortcutIds, expectedSecond);
    assert.ok(ctx.affected.has(ref.id));
  });
}

test('same-folder move indexes after removal, including unchanged placement', () => {
  const ctx = run([
    { type: 'desktop.move', ref: { kind: 'shortcut', id: 's1' },
      to: { kind: 'folder', folderId: 'g1', index: 1 } },
    { type: 'desktop.move', ref: { kind: 'shortcut', id: 's2' },
      to: { kind: 'folder', folderId: 'g1', index: 1 } },
    { type: 'desktop.move', ref: { kind: 'shortcut', id: 's2' },
      to: { kind: 'folder', folderId: 'g1', index: 1 } },
  ]);
  assert.deepEqual(ctx.snapshot.layout.folders[0].shortcutIds, ['s1', 's2']);
});

for (const mode of ['dissolve', 'remove-shortcuts'] as const) {
  test(`folder ${mode} replaces at original mixed position and never changes assets or Dock`, () => {
    const ctx = run([
      { type: 'desktop.move', ref: { kind: 'shortcut', id: 's3' },
        to: { kind: 'folder', folderId: 'g1', index: 0 } },
      { type: 'desktop.folder.remove', id: 'g1', mode },
    ]);
    assert.deepEqual(ctx.snapshot.layout.root.map(ref => ref.id),
      mode === 'dissolve' ? ['s1', 's3', 's2', 'g2'] : ['s1', 'g2']);
    assert.deepEqual(ctx.snapshot.layout.shortcuts.map(item => item.id),
      mode === 'dissolve' ? ['s1', 's2', 's3'] : ['s1']);
    assert.deepEqual(ctx.snapshot.layout.dock, fixture().layout.dock);
    assert.ok(ctx.affected.has('g1'));
    assert.ok(ctx.affected.has('s2'));
    assert.ok(ctx.affected.has('s3'));
  });
}

test('Dock pin, idempotent pin, move and unpin are independent from desktop', () => {
  const ctx = run([
    { type: 'dock.pin', bookmarkId: 'b3', pinId: 'p3', index: 1 },
    { type: 'dock.pin', bookmarkId: 'b2', pinId: 'unused', index: 0 },
    { type: 'dock.move', pinId: 'p1', index: 2 },
  ]);
  assert.deepEqual(ctx.snapshot.layout.dock.map(pin => pin.id), ['p3', 'p2', 'p1']);
  assert.ok(ctx.affected.has('p2'));
  ctx.claim('unused');
  const removed = run([
    { type: 'dock.unpin', bookmarkId: 'b1' },
    { type: 'dock.unpin', bookmarkId: 'b2' },
    { type: 'dock.unpin', bookmarkId: 'b2' },
  ]);
  assert.deepEqual(removed.snapshot.layout.dock, []);
  assert.deepEqual(removed.snapshot.layout.shortcuts, fixture().layout.shortcuts);
  assert.deepEqual(removed.snapshot.layout.root, fixture().layout.root);
});

test('Dock can move backward or stay at the same post-removal index', () => {
  const ctx = run([
    { type: 'dock.move', pinId: 'p2', index: 0 },
    { type: 'dock.move', pinId: 'p2', index: 0 },
  ]);
  assert.deepEqual(ctx.snapshot.layout.dock.map(pin => pin.id), ['p2', 'p1']);
});

test('all entry points reject missing references with domain errors', () => {
  const missing: LayoutAction[] = [
    { type: 'desktop.pin', bookmarkId: 'missing', shortcutId: 's4', to: { kind: 'root', index: 0 } },
    { type: 'desktop.unpin', bookmarkId: 'missing' },
    { type: 'desktop.folder.rename', id: 'missing', name: 'New' },
    { type: 'desktop.folder.remove', id: 'missing', mode: 'dissolve' },
    { type: 'desktop.move', ref: { kind: 'shortcut', id: 'missing' }, to: { kind: 'root', index: 0 } },
    { type: 'desktop.move', ref: { kind: 'desktop-folder', id: 'missing' }, to: { kind: 'root', index: 0 } },
    { type: 'desktop.folder.create', id: 'g3', name: 'New', shortcutIds: ['missing'], index: 0 },
    { type: 'dock.pin', bookmarkId: 'missing', pinId: 'p3', index: 0 },
    { type: 'dock.unpin', bookmarkId: 'missing' },
    { type: 'dock.move', pinId: 'missing', index: 0 },
  ];
  for (const action of missing) rejects(action, 'NOT_FOUND');
  for (const action of [
    { type: 'desktop.pin', bookmarkId: 'b4', shortcutId: 's4',
      to: { kind: 'folder', folderId: 'missing', index: 0 } },
    { type: 'desktop.move', ref: { kind: 'shortcut', id: 's1' },
      to: { kind: 'folder', folderId: 'missing', index: 0 } },
  ] satisfies LayoutAction[]) rejects(action, 'INVALID_REFERENCE');
});

test('desktop groups cannot nest, including inside themselves', () => {
  for (const folderId of ['g1', 'g2']) {
    rejects({ type: 'desktop.move', ref: { kind: 'desktop-folder', id: 'g1' },
      to: { kind: 'folder', folderId, index: 0 } }, 'INVALID_REFERENCE');
  }
});

test('duplicate shortcut selections and blank group names are invalid input', () => {
  rejects({ type: 'desktop.folder.create', id: 'g3', name: 'New',
    shortcutIds: ['s1', 's1'], index: 0 }, 'INVALID_INPUT');
  for (const name of ['', '  \t']) {
    rejects({ type: 'desktop.folder.create', id: 'g3', name, shortcutIds: [], index: 0 }, 'INVALID_INPUT');
    rejects({ type: 'desktop.folder.rename', id: 'g1', name }, 'INVALID_INPUT');
  }
});

for (const index of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
  test(`all indexed commands reject non-index ${index}`, () => {
    const actions: LayoutAction[] = [
      { type: 'desktop.pin', bookmarkId: 'b4', shortcutId: 's4', to: { kind: 'root', index } },
      { type: 'desktop.pin', bookmarkId: 'b4', shortcutId: 's4', to: { kind: 'folder', folderId: 'g1', index } },
      { type: 'desktop.folder.create', id: 'g3', name: 'New', shortcutIds: [], index },
      { type: 'desktop.move', ref: { kind: 'shortcut', id: 's1' }, to: { kind: 'root', index } },
      { type: 'dock.pin', bookmarkId: 'b4', pinId: 'p4', index },
      { type: 'dock.move', pinId: 'p1', index },
    ];
    for (const action of actions) rejects(action, 'INVALID_INPUT');
  });
}

test('out-of-range indexes are rejected rather than clipped after source removal', () => {
  for (const action of [
    { type: 'desktop.pin', bookmarkId: 'b4', shortcutId: 's4', to: { kind: 'root', index: 5 } },
    { type: 'desktop.pin', bookmarkId: 'b4', shortcutId: 's4', to: { kind: 'folder', folderId: 'g1', index: 2 } },
    { type: 'desktop.folder.create', id: 'g3', name: 'New', shortcutIds: ['s1', 's3'], index: 3 },
    { type: 'desktop.move', ref: { kind: 'shortcut', id: 's1' }, to: { kind: 'root', index: 4 } },
    { type: 'desktop.move', ref: { kind: 'shortcut', id: 's2' }, to: { kind: 'folder', folderId: 'g1', index: 1 } },
    { type: 'desktop.move', ref: { kind: 'desktop-folder', id: 'g1' }, to: { kind: 'root', index: 4 } },
    { type: 'dock.pin', bookmarkId: 'b4', pinId: 'p4', index: 3 },
    { type: 'dock.move', pinId: 'p1', index: 2 },
  ] satisfies LayoutAction[]) rejects(action, 'INVALID_INPUT');
});

test('new shortcut, folder and Dock IDs use the global claim boundary', () => {
  const base = fixture();
  base.trash.push({ id: 'trash-id', deletedAt: 2, origin: null,
    payload: { kind: 'collection', index: 0, collection: {
      id: 'collection-id', title: '', description: '', cover: null, provenance: [],
      createdAt: 1, updatedAt: 1,
      sections: [{ id: 'section-id', title: '', description: '',
        items: [{ id: 'item-id', bookmarkId: null, title: '', url: 'https://example.com/',
          icon: null, recommendationReason: '' }] }],
    } } });
  assert.equal(validateSnapshot(base).ok, true);
  for (const id of ['b1', 's1', 'g1', 'p1', 'trash-id', 'collection-id', 'section-id', 'item-id']) {
    rejects({ type: 'desktop.pin', bookmarkId: 'b4', shortcutId: id,
      to: { kind: 'root', index: 0 } }, 'ID_COLLISION', base);
    rejects({ type: 'desktop.folder.create', id, name: 'New', shortcutIds: [], index: 0 },
      'ID_COLLISION', base);
    rejects({ type: 'dock.pin', bookmarkId: 'b4', pinId: id, index: 0 }, 'ID_COLLISION', base);
  }
});

test('IDs removed earlier in the batch cannot be reused across layout entity types', () => {
  const ctx = context(fixture());
  applyLayoutAction(ctx, { type: 'desktop.unpin', bookmarkId: 'b1' });
  assert.throws(() => applyLayoutAction(ctx,
    { type: 'dock.pin', bookmarkId: 'b4', pinId: 's1', index: 0 }),
  (error: unknown) => error instanceof DomainFailure && error.code === 'ID_COLLISION');
  applyLayoutAction(ctx, { type: 'dock.pin', bookmarkId: 'b4', pinId: 'new-id', index: 0 });
  applyLayoutAction(ctx, { type: 'dock.unpin', bookmarkId: 'b4' });
  assert.throws(() => applyLayoutAction(ctx,
    { type: 'desktop.folder.create', id: 'new-id', name: 'New', shortcutIds: [], index: 0 }),
  (error: unknown) => error instanceof DomainFailure && error.code === 'ID_COLLISION');
  assert.equal(validateSnapshot(ctx.snapshot).ok, true);
});
