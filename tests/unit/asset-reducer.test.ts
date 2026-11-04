import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AssetAction, AssetCommand } from '../../src/domain/assets/commands';
import type { AssetSnapshot, ErrorCode } from '../../src/domain/assets/model';
import { reduceCommand } from '../../src/domain/assets/reducer';
import { bookmarkSnapshot, emptySnapshot } from '../support/asset-fixtures';

function command(actions: AssetAction[]): AssetCommand {
  return { commandId: 'c1', expected: null, at: 10, actions };
}
function apply(snapshot: AssetSnapshot, actions: AssetAction[]): AssetSnapshot {
  const before = structuredClone(snapshot);
  const result = reduceCommand(snapshot, command(actions));
  assert.deepEqual(snapshot, before, 'Reducer must not mutate its caller');
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('Expected valid command');
  return result.value.next;
}
function rejects(snapshot: AssetSnapshot, actions: AssetAction[], code?: ErrorCode) {
  const before = structuredClone(snapshot);
  const result = reduceCommand(snapshot, command(actions));
  assert.equal(result.ok, false);
  if (!result.ok && code) assert.equal(result.error.code, code);
  assert.deepEqual(snapshot, before);
}
function tree(): AssetSnapshot {
  const s = bookmarkSnapshot();
  s.library.bookmarks.push({ ...s.library.bookmarks[0], id: 'b2', url: 'https://example.org/' });
  s.library.folders.push(
    { id: 'f1', name: 'Same', createdAt: 1, updatedAt: 1, children: [{ kind: 'bookmark', id: 'b1' }, { kind: 'folder', id: 'f2' }] },
    { id: 'f2', name: 'Same', createdAt: 1, updatedAt: 1, children: [{ kind: 'bookmark', id: 'b2' }] },
  );
  s.library.root = [{ kind: 'folder', id: 'f1' }];
  return s;
}
const input = {
  title: 'New', url: 'https://example.com/', icon: null, notes: 'private',
  keywords: ['图片', '壁纸'],
} as const;
const create = (id = 'new'): AssetAction => ({
  type: 'bookmark.create', id, input: { ...input, keywords: [...input.keywords] },
  to: { parentId: null, index: 0 }, duplicates: 'reject', desktop: null,
});

test('creation keeps keywords/notes, timestamps and optional desktop pin in one command', () => {
  const action = create();
  assert.equal(action.type, 'bookmark.create');
  if (action.type !== 'bookmark.create') return;
  action.desktop = { shortcutId: 'sc1', to: { kind: 'root', index: 0 } };
  const next = apply(emptySnapshot(), [action]);
  assert.equal(next.library.bookmarks[0].notes, 'private');
  assert.deepEqual(next.library.bookmarks[0].keywords, ['图片', '壁纸']);
  assert.equal(next.library.bookmarks[0].createdAt, 10);
  assert.deepEqual(next.library.root, [{ kind: 'bookmark', id: 'new' }]);
  assert.deepEqual(next.layout.shortcuts, [{ id: 'sc1', bookmarkId: 'new' }]);
});

test('same-container duplicate requires a decision, while keeping a copy is explicit', () => {
  rejects(bookmarkSnapshot(), [create()], 'DUPLICATE_REQUIRES_DECISION');
  const action = create(); if (action.type !== 'bookmark.create') return;
  action.duplicates = 'keep';
  const next = apply(bookmarkSnapshot(), [action]);
  assert.equal(next.library.bookmarks.length, 2);
});

test('duplicates in another folder remain independent and URL fragments and ports stay distinct', () => {
  const s = tree();
  const a = create();
  const next = apply(s, [a]);
  assert.equal(next.library.bookmarks.length, 3);
  for (const url of ['https://example.com/#one', 'https://example.com:8443/', 'https://www.example.com/']) {
    const action = create(); if (action.type !== 'bookmark.create') return;
    action.input.url = url;
    assert.equal(apply(bookmarkSnapshot(), [action]).library.bookmarks.length, 2);
  }
});

test('editing preserves identity and creation time without changing collection snapshots', () => {
  const s = bookmarkSnapshot();
  s.collections.push({
    id: 'col1', title: 'List', description: '', cover: null, provenance: [], createdAt: 1, updatedAt: 1,
    sections: [{ id: 'sec1', title: '', description: '', items: [{
      id: 'item1', bookmarkId: 'b1', title: 'Snapshot title', url: 'https://old.example/',
      icon: null, recommendationReason: 'Public recommendation',
    }] }],
  });
  const next = apply(s, [{
    type: 'bookmark.update', id: 'b1', input: { ...input, title: 'Edited', keywords: ['photo'] }, duplicates: 'reject',
  }]);
  assert.equal(next.library.bookmarks[0].title, 'Edited');
  assert.equal(next.library.bookmarks[0].id, 'b1');
  assert.equal(next.library.bookmarks[0].createdAt, 1);
  assert.equal(next.library.bookmarks[0].updatedAt, 10);
  assert.deepEqual(next.collections, s.collections);
});

test('folder creation and rename preserve same-name identities and root mixed order', () => {
  const next = apply(bookmarkSnapshot(), [
    { type: 'library.folder.create', id: 'f1', name: 'Same', to: { parentId: null, index: 0 } },
    { type: 'library.folder.create', id: 'f2', name: 'Same', to: { parentId: null, index: 2 } },
    { type: 'library.folder.rename', id: 'f1', name: 'Changed' },
  ]);
  assert.deepEqual(next.library.root.map((ref) => ref.id), ['f1', 'b1', 'f2']);
  assert.deepEqual(next.library.folders.map((folder) => folder.name), ['Changed', 'Same']);
});

test('mixed moves use post-removal index and supplied selection order without automatic dedupe', () => {
  const s = tree();
  const next = apply(s, [{
    type: 'library.move', refs: [{ kind: 'bookmark', id: 'b2' }, { kind: 'bookmark', id: 'b1' }],
    to: { parentId: null, index: 0 },
  }]);
  assert.deepEqual(next.library.root.map((ref) => ref.id), ['b2', 'b1', 'f1']);
  assert.deepEqual(next.library.folders.find((f) => f.id === 'f2')!.children, []);
});

test('moves reject self/descendant targets and overlapping selection without changing caller', () => {
  const s = tree();
  rejects(s, [{ type: 'library.move', refs: [{ kind: 'folder', id: 'f1' }], to: { parentId: 'f2', index: 0 } }]);
  rejects(s, [{ type: 'library.move', refs: [{ kind: 'folder', id: 'f1' }, { kind: 'bookmark', id: 'b2' }], to: { parentId: null, index: 0 } }]);
  rejects(s, [{ type: 'library.move', refs: [{ kind: 'bookmark', id: 'b1' }, { kind: 'bookmark', id: 'b1' }], to: { parentId: null, index: 0 } }]);
});

test('folder dissolve inserts its mixed direct children at the former folder position', () => {
  const next = apply(tree(), [{ type: 'library.folder.dissolve', id: 'f1' }]);
  assert.deepEqual(next.library.root, [{ kind: 'bookmark', id: 'b1' }, { kind: 'folder', id: 'f2' }]);
  assert.deepEqual(next.library.folders.map((folder) => folder.id), ['f2']);
});

test('trashing a subtree removes only its desktop/Dock references and detaches collection links', () => {
  const s = tree();
  s.layout.shortcuts = [{ id: 'sc1', bookmarkId: 'b1' }];
  s.layout.root = [{ kind: 'shortcut', id: 'sc1' }];
  s.layout.dock = [{ id: 'pin1', bookmarkId: 'b2' }];
  s.collections = [{
    id: 'col1', title: 'List', description: '', cover: null, provenance: [], createdAt: 1, updatedAt: 1,
    sections: [{ id: 'sec1', title: '', description: '', items: [{
      id: 'item1', bookmarkId: 'b2', title: 'Old title', url: 'https://old.example/',
      icon: null, recommendationReason: 'Public reasoning',
    }] }],
  }];
  const next = apply(s, [{ type: 'library.trash', refs: [{ kind: 'folder', id: 'f1' }], trashIds: ['t1'] }]);
  assert.equal(next.library.bookmarks.length, 0);
  assert.equal(next.library.folders.length, 0);
  assert.equal(next.trash.length, 1);
  assert.equal(next.trash[0].payload.kind, 'folder-tree');
  assert.equal(next.layout.shortcuts.length, 0);
  assert.equal(next.layout.dock.length, 0);
  assert.deepEqual(next.collections[0].sections[0].items[0], { ...s.collections[0].sections[0].items[0], bookmarkId: null });
  const restored = apply(next, [{ type: 'trash.restore', ids: ['t1'] }]);
  assert.deepEqual(restored.library, s.library);
  assert.equal(restored.layout.shortcuts.length, 0);
  assert.equal(restored.collections[0].sections[0].items[0].bookmarkId, null);
});

test('restoration falls back to root when the former parent is missing and preserves asset IDs', () => {
  let next = apply(tree(), [{ type: 'library.trash', refs: [{ kind: 'bookmark', id: 'b2' }], trashIds: ['t1'] }]);
  next = apply(next, [{ type: 'library.trash', refs: [{ kind: 'folder', id: 'f1' }], trashIds: ['t2'] }]);
  next = apply(next, [{ type: 'trash.restore', ids: ['t1'] }]);
  assert.deepEqual(next.library.root, [{ kind: 'bookmark', id: 'b2' }]);
  assert.equal(next.trash[0].id, 't2');
});

test('batch deletion records original positions and restoration preserves original sibling order', () => {
  const s = bookmarkSnapshot();
  for (const id of ['b2', 'b3']) {
    s.library.bookmarks.push({ ...s.library.bookmarks[0], id });
    s.library.root.push({ kind: 'bookmark', id });
  }
  let next = apply(s, [{ type: 'library.trash', refs: [{ kind: 'bookmark', id: 'b1' }, { kind: 'bookmark', id: 'b2' }], trashIds: ['t1', 't2'] }]);
  assert.deepEqual(next.trash.map((entry) => entry.origin!.index), [0, 1]);
  next = apply(next, [{ type: 'trash.restore', ids: ['t2', 't1'] }]);
  assert.deepEqual(next.library.root.map((ref) => ref.id), ['b1', 'b2', 'b3']);
});

test('purge removes only the selected trash batch and cannot reuse its IDs within a command', () => {
  const s = apply(bookmarkSnapshot(), [{ type: 'library.trash', refs: [{ kind: 'bookmark', id: 'b1' }], trashIds: ['t1'] }]);
  assert.equal(apply(s, [{ type: 'trash.purge', ids: ['t1'] }]).trash.length, 0);
  rejects(s, [{ type: 'trash.purge', ids: ['t1'] }, create('b1')], 'ID_COLLISION');
});

test('partial failure, unsupported protocols, invalid targets and existing IDs never change caller', () => {
  rejects(bookmarkSnapshot(), [{ type: 'library.folder.rename', id: 'missing', name: 'X' }], 'NOT_FOUND');
  rejects(bookmarkSnapshot(), [{ type: 'library.folder.create', id: 'b1', name: 'X', to: { parentId: null, index: 0 } }], 'ID_COLLISION');
  rejects(emptySnapshot(), [create(), { type: 'library.folder.rename', id: 'missing', name: 'X' }], 'NOT_FOUND');
  const action = create(); if (action.type !== 'bookmark.create') return;
  action.input.url = 'javascript:alert(1)';
  rejects(emptySnapshot(), [action]);
});

test('command metadata, unknown action fields and non-data inputs are rejected without invoking getters', () => {
  for (const value of [
    { ...command([create()]), actions: [] }, { ...command([create()]), unexpected: true },
    { ...command([create()]), at: NaN }, { ...command([create()]), actions: [{ ...create(), unexpected: true }] },
    { ...command([create()]), actions: [{ type: 'future.action' }] },
  ]) {
    assert.equal(reduceCommand(emptySnapshot(), value as AssetCommand).ok, false);
  }
  let calls = 0;
  const value = command([create()]);
  Object.defineProperty(value, 'actions', { enumerable: true, get() { calls++; return []; } });
  assert.equal(reduceCommand(emptySnapshot(), value).ok, false);
  assert.equal(calls, 0);
});

test('deleting an associated bookmark also detaches trashed collections without leaking private notes', () => {
  const s = bookmarkSnapshot();
  s.library.bookmarks[0].notes = 'Private secret must not become a recommendation';
  s.trash.push({
    id: 'tc1', deletedAt: 2, origin: null,
    payload: { kind: 'collection', index: 0, collection: {
      id: 'c1', title: 'Archived list', description: '', cover: null, provenance: [], createdAt: 1, updatedAt: 1,
      sections: [{ id: 'sec1', title: '', description: '', items: [{
        id: 'item1', bookmarkId: 'b1', title: 'Snapshot', url: 'https://old.example/',
        icon: null, recommendationReason: 'Original reasoning',
      }] }],
    } },
  });
  const next = apply(s, [{ type: 'library.trash', refs: [{ kind: 'bookmark', id: 'b1' }], trashIds: ['tb1'] }]);
  const payload = next.trash[0].payload;
  assert.equal(payload.kind, 'collection');
  if (payload.kind !== 'collection') return;
  assert.equal(payload.collection.sections[0].items[0].bookmarkId, null);
  assert.equal(payload.collection.sections[0].items[0].recommendationReason, 'Original reasoning');
});

test('restoring a child and its separately trashed parent works regardless of request order', () => {
  const s = tree();
  let next = apply(s, [{ type: 'library.trash', refs: [{ kind: 'bookmark', id: 'b2' }], trashIds: ['child-trash'] }]);
  next = apply(next, [{ type: 'library.trash', refs: [{ kind: 'folder', id: 'f1' }], trashIds: ['parent-trash'] }]);
  next = apply(next, [{ type: 'trash.restore', ids: ['child-trash', 'parent-trash'] }]);
  assert.deepEqual(next.library.root, [{ kind: 'folder', id: 'f1' }]);
  assert.deepEqual(next.library.folders.find((folder) => folder.id === 'f2')!.children, [{ kind: 'bookmark', id: 'b2' }]);
  assert.equal(next.trash.length, 0);
});

test('missing protocol is completed while keywords are trimmed and deduplicated without public side effects', () => {
  const action = create(); if (action.type !== 'bookmark.create') return;
  action.input.url = ' example.com:8443/path#A ';
  action.input.keywords = [' 图片 ', '图片', '', '壁纸'];
  const next = apply(emptySnapshot(), [action]);
  assert.equal(next.library.bookmarks[0].url, 'https://example.com:8443/path#A');
  assert.deepEqual(next.library.bookmarks[0].keywords, ['图片', '壁纸']);
  assert.deepEqual(next.collections, []);
});
