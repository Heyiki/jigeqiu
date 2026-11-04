import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSnapshotStore, ASSET_KEY } from '../../src/services/persistence/snapshot-store';
import type { AssetAction, AssetCommand } from '../../src/domain/assets/commands';
import { emptySnapshot } from '../support/asset-fixtures';
import { MemoryStorage } from '../support/memory-storage';

class SerialLocks {
  private tail = Promise.resolve();
  held = false;
  async runExclusive<T>(_name: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    this.held = true;
    try { return await task(); } finally { this.held = false; release(); }
  }
}
function setup() {
  const storage = new MemoryStorage();
  const locks = new SerialLocks();
  const first = createSnapshotStore({ storage: () => storage, locks, newStoreId: () => 'store' });
  const second = createSnapshotStore({ storage: () => storage, locks, newStoreId: () => 'other' });
  return { storage, locks, first, second };
}
function command(actions: AssetAction[], commandId = 'c1'): AssetCommand {
  return { commandId, expected: null, at: 10, actions };
}
const create: AssetAction = {
  type: 'bookmark.create', id: 'b1', to: { parentId: null, index: 0 }, duplicates: 'reject', desktop: null,
  input: { title: 'Example', url: 'https://example.com/', notes: 'Private', keywords: ['photo'], icon: null },
};
test('execute persists multiple actions as one revision and returns affected identities', async () => {
  const { first, storage } = setup();
  assert.equal(typeof first.execute, 'function');
  const result = await first.execute(command([
    create, { type: 'desktop.pin', bookmarkId: 'b1', shortcutId: 'sc1', to: { kind: 'root', index: 0 } },
  ]));
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) return;
  assert.equal(result.value.envelope.version.revision, 1);
  assert.ok(result.value.affectedIds.includes('b1'));
  assert.ok(result.value.affectedIds.includes('sc1'));
  assert.equal(JSON.parse(storage.getItem(ASSET_KEY)!).snapshot.layout.shortcuts[0].bookmarkId, 'b1');
});

test('an invalid second action never writes the successful first action', async () => {
  const { first, storage } = setup();
  assert.equal(typeof first.execute, 'function');
  const result = await first.execute(command([create, { type: 'dock.pin', bookmarkId: 'missing', pinId: 'p1', index: 0 }]));
  assert.equal(result.ok, false);
  assert.equal(storage.getItem(ASSET_KEY), null);
});

test('two command services cannot overwrite the same expected revision', async () => {
  const { first, second } = setup();
  assert.equal(typeof first.execute, 'function');
  const initial = await first.commit(null, emptySnapshot(), 'initial', 1);
  assert.equal(initial.ok, true); if (!initial.ok) return;
  const a = { ...command([create], 'a'), expected: initial.value.version };
  const b = { ...command([{ ...create, id: 'b2' }], 'b'), expected: initial.value.version };
  const results = await Promise.all([first.execute(a), second.execute(b)]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  const loser = results.find((result) => !result.ok);
  assert.equal(loser && !loser.ok && loser.error.code, 'CONFLICT');
});

test('execute captures queued command input and does not publish on write failure', async () => {
  const { first, storage, locks } = setup();
  assert.equal(typeof first.execute, 'function');
  let release!: () => void;
  const barrier = locks.runExclusive('test', () => new Promise<void>((resolve) => { release = resolve; }));
  await Promise.resolve();
  const requested = command([structuredClone(create)]);
  const pending = first.execute(requested);
  requested.actions = [];
  release(); await barrier;
  const saved = await pending;
  assert.equal(saved.ok, true); if (!saved.ok) return;
  const before = storage.getItem(ASSET_KEY);
  let notifications = 0;
  first.subscribe(() => { notifications++; });
  storage.failWrites = true;
  const failed = await first.execute({
    ...command([{ type: 'library.trash', refs: [{ kind: 'bookmark', id: 'b1' }], trashIds: ['t1'] }], 'c2'),
    expected: saved.value.envelope.version,
  });
  assert.equal(failed.ok, false);
  assert.equal(notifications, 0);
  assert.equal(storage.getItem(ASSET_KEY), before);
});

test('a successful batch writes once under its lock, and reducer failure writes zero times', async () => {
  const locks = new SerialLocks();
  const writes: { key: string; held: boolean }[] = [];
  class ObservedStorage extends MemoryStorage {
    override setItem(key: string, value: string) {
      writes.push({ key, held: locks.held });
      super.setItem(key, value);
    }
  }
  const storage = new ObservedStorage();
  const store = createSnapshotStore({ storage: () => storage, locks, newStoreId: () => 'store' });
  const saved = await store.execute(command([
    create, { type: 'dock.pin', bookmarkId: 'b1', pinId: 'p1', index: 0 },
  ]));
  assert.equal(saved.ok, true); if (!saved.ok) return;
  assert.deepEqual(writes, [{ key: ASSET_KEY, held: true }]);
  const rejected = await store.execute({
    ...command([
      { type: 'library.folder.create', id: 'f1', name: 'Draft', to: { parentId: null, index: 0 } },
      { type: 'desktop.pin', bookmarkId: 'missing', shortcutId: 'bad', to: { kind: 'root', index: 0 } },
    ], 'c2'), expected: saved.value.envelope.version,
  });
  assert.equal(rejected.ok, false);
  assert.deepEqual(writes, [{ key: ASSET_KEY, held: true }]);
});
