import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSnapshotStore, ASSET_KEY, PERSISTENCE_LOCK } from '../../src/services/persistence/snapshot-store';
import { bookmarkSnapshot, emptySnapshot } from '../support/asset-fixtures';
import { MemoryStorage } from '../support/memory-storage';

// Shared by two store instances, as a browser lock manager is shared by pages.
class SerialLocks {
  private tail = Promise.resolve();
  async runExclusive<T>(name: string, task: () => Promise<T>): Promise<T> {
    assert.equal(name, PERSISTENCE_LOCK);
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await task(); } finally { release(); }
  }
}

function setup(storage = new MemoryStorage(), locks: SerialLocks | null = new SerialLocks()) {
  const store = createSnapshotStore({ storage: () => storage, locks, newStoreId: () => 'store-1' });
  return { storage, store, locks };
}

async function seed(storage = new MemoryStorage(), locks = new SerialLocks()) {
  const { store } = setup(storage, locks);
  const saved = await store.commit(null, bookmarkSnapshot(), 'commit-1', 1);
  assert.equal(saved.ok, true);
  if (!saved.ok) throw new Error('Fixture commit failed');
  return { store, storage, locks, version: saved.value.version };
}

test('read distinguishes absence from data and never persists an empty/default library', async () => {
  const { store, storage } = setup();
  assert.deepEqual(await store.read(), { ok: true, value: { kind: 'empty' } });
  assert.equal(storage.length, 0);
  assert.deepEqual(store.readRaw(), { ok: true, value: null });
});

test('one commit writes a validated snapshot with independent copies on read', async () => {
  const { store, storage } = setup();
  const next = bookmarkSnapshot();
  const saved = await store.commit(null, next, 'commit-1', 10);
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.deepEqual(saved.value.version, { storeId: 'store-1', revision: 1, commitId: 'commit-1' });
  assert.equal(saved.value.committedAt, 10);
  next.library.bookmarks[0].title = 'Not saved';
  saved.value.snapshot.library.bookmarks[0].title = 'Also not saved';
  const loaded = await store.read();
  assert.equal(loaded.ok && loaded.value.kind === 'ready' && loaded.value.envelope.snapshot.library.bookmarks[0].title, 'Example');
  assert.equal(storage.length, 1);
});

for (const [label, raw, code] of [
  ['invalid JSON', '{broken', 'CORRUPT_DATA'],
  ['empty string', '', 'CORRUPT_DATA'],
  ['null', 'null', 'CORRUPT_DATA'],
  ['invalid shape', '{"format":"jigeqiu-local-assets","schemaVersion":1}', 'CORRUPT_DATA'],
  ['future schema', '{"format":"jigeqiu-local-assets","schemaVersion":99}', 'UNSUPPORTED_VERSION'],
] as const) {
  test(`${label} is reported and cannot be overwritten with empty data`, async () => {
    const { store, storage } = setup();
    storage.setItem(ASSET_KEY, raw);
    const read = await store.read();
    assert.equal(read.ok, false);
    if (!read.ok) assert.equal(read.error.code, code);
    const commit = await store.commit(null, emptySnapshot(), 'replacement', 2);
    assert.equal(commit.ok, false);
    assert.equal(storage.getItem(ASSET_KEY), raw);
    assert.deepEqual(store.readRaw(), { ok: true, value: raw });
  });
}

test('a valid new snapshot takes precedence over untouched legacy data', async () => {
  const { store, storage } = await seed();
  storage.setItem('jipage_bookmarks_v1', '{old broken data');
  const loaded = await store.read();
  assert.equal(loaded.ok && loaded.value.kind, 'ready');
  assert.equal(storage.getItem('jipage_bookmarks_v1'), '{old broken data');
});

test('legacy data requires explicit migration, including unknown legacy domains', async () => {
  const { store, storage } = setup();
  storage.setItem('jipage_bookmarks_v1', '[]');
  storage.setItem('jipage_custom_v1', '{raw');
  storage.setItem('unrelated', 'private');
  assert.deepEqual(await store.read(), {
    ok: true, value: { kind: 'legacy', raw: { jipage_bookmarks_v1: '[]', jipage_custom_v1: '{raw' } },
  });
  const result = await store.commit(null, emptySnapshot(), 'commit-1', 1);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'LEGACY_REQUIRES_PREVIEW');
  assert.equal(storage.getItem(ASSET_KEY), null);
  assert.equal(storage.getItem('jipage_custom_v1'), '{raw');
});

test('unavailable localStorage getter and denied reads do not become an empty library', async () => {
  const denied = createSnapshotStore({
    storage: () => { throw new DOMException('Denied', 'SecurityError'); },
    locks: new SerialLocks(), newStoreId: () => 'store-1',
  });
  assert.equal((await denied.read()).ok, false);
  assert.equal(denied.readRaw().ok, false);
  const { store, storage } = setup();
  storage.failReads = true;
  const result = await store.read();
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'STORAGE_UNAVAILABLE');
  assert.equal(storage.length, 0);
});

for (const [label, denied, code] of [
  ['quota', 'quota', 'QUOTA_EXCEEDED'],
  ['permission', 'permission', 'STORAGE_WRITE_FAILED'],
] as const) {
  test(`a ${label} failure preserves previous bytes and reports a failed save`, async () => {
    const storage = new MemoryStorage({ maxBytes: 2000 });
    const { store, version } = await seed(storage);
    const original = storage.getItem(ASSET_KEY);
    const next = bookmarkSnapshot();
    if (denied === 'quota') next.library.bookmarks[0].notes = 'x'.repeat(2000);
    else storage.failWrites = true;
    const result = await store.commit(version, next, 'commit-2', 2);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, code);
    assert.equal(storage.getItem(ASSET_KEY), original);
  });
}

test('invalid references and cycles are rejected before touching stored data', async () => {
  const { store, storage, version } = await seed();
  const original = storage.getItem(ASSET_KEY);
  const next = bookmarkSnapshot();
  next.layout.dock.push({ id: 'pin-1', bookmarkId: 'missing' });
  assert.equal((await store.commit(version, next, 'commit-2', 2)).ok, false);
  assert.equal(storage.getItem(ASSET_KEY), original);
});

test('revision checks compare store identity and commit identity, not only its counter', async () => {
  const { store, storage, version } = await seed();
  const original = storage.getItem(ASSET_KEY);
  for (const expected of [
    null, { ...version, storeId: 'other-store' }, { ...version, commitId: 'other-commit' },
  ]) {
    const result = await store.commit(expected, emptySnapshot(), 'commit-2', 2);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'CONFLICT');
    assert.equal(storage.getItem(ASSET_KEY), original);
  }
});

test('two stores submitting the same base concurrently cannot both win', async () => {
  const { store, storage, locks, version } = await seed();
  const second = setup(storage, locks).store;
  const a = bookmarkSnapshot();
  const b = bookmarkSnapshot();
  a.library.bookmarks[0].title = 'Page A';
  b.library.bookmarks[0].title = 'Page B';
  const results = await Promise.all([
    store.commit(version, a, 'commit-a', 2),
    second.commit(version, b, 'commit-b', 2),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  const failed = results.find((result) => !result.ok);
  assert.equal(failed && !failed.ok && failed.error.code, 'CONFLICT');
  const loaded = await second.read();
  assert.equal(loaded.ok && loaded.value.kind === 'ready' && loaded.value.envelope.version.revision, 2);
});

test('queued input is detached from subsequent caller mutations', async () => {
  const { store, storage, locks, version } = await seed();
  let release!: () => void;
  const blocker = locks.runExclusive(PERSISTENCE_LOCK, () => new Promise<void>((resolve) => { release = resolve; }));
  await Promise.resolve();
  const next = bookmarkSnapshot();
  next.library.bookmarks[0].title = 'Confirmed';
  const result = store.commit(version, next, 'commit-2', 2);
  next.library.bookmarks[0].title = 'Unconfirmed mutation';
  version.commitId = 'mutated';
  release();
  await blocker;
  assert.equal((await result).ok, true);
  assert.equal(JSON.parse(storage.getItem(ASSET_KEY)!).snapshot.library.bookmarks[0].title, 'Confirmed');
});

test('no lock coordinator means read-only, including first save and simultaneous saves', async () => {
  const { store, storage } = setup(new MemoryStorage(), null);
  assert.deepEqual(store.capability(), { mode: 'read-only', reason: 'LOCK_UNAVAILABLE' });
  const results = await Promise.all([
    store.commit(null, emptySnapshot(), 'c1', 1), store.commit(null, emptySnapshot(), 'c2', 1),
  ]);
  for (const result of results) {
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'LOCK_UNAVAILABLE');
  }
  assert.equal(storage.length, 0);
  assert.deepEqual(await store.read(), { ok: true, value: { kind: 'empty' } });
});

test('a rejected lock request reports failure without any write', async () => {
  const storage = new MemoryStorage();
  const store = createSnapshotStore({
    storage: () => storage, newStoreId: () => 'store-1',
    locks: { runExclusive: async () => { throw new Error('Lock denied'); } },
  });
  const result = await store.commit(null, emptySnapshot(), 'commit-1', 1);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'LOCK_UNAVAILABLE');
  assert.equal(storage.length, 0);
  assert.equal(store.capability().mode, 'read-only');
});

test('uncertain write verification freezes later commits without rollback or false success', async () => {
  class UnverifiableStorage extends MemoryStorage {
    override setItem(key: string, value: string) {
      super.setItem(key, value);
      this.failReads = true;
    }
  }
  const storage = new UnverifiableStorage();
  const { store } = setup(storage);
  const result = await store.commit(null, bookmarkSnapshot(), 'commit-1', 1);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'COMMIT_UNCERTAIN');
  storage.failReads = false;
  assert.notEqual(storage.getItem(ASSET_KEY), null);
  const again = await store.commit(null, emptySnapshot(), 'commit-2', 2);
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.error.code, 'COMMIT_UNCERTAIN');
});

test('observer exceptions cannot turn a successful write into a failed save', async () => {
  const { store } = setup();
  const received: unknown[] = [];
  const off = store.subscribe(() => { throw new Error('UI listener failure'); });
  store.subscribe((change) => received.push(change));
  const saved = await store.commit(null, emptySnapshot(), 'commit-1', 1);
  assert.equal(saved.ok, true);
  assert.deepEqual(received, [{
    version: { storeId: 'store-1', revision: 1, commitId: 'commit-1' }, requiresReload: false,
  }]);
  off();
});

test('external invalidations notify subscribers without ever writing or replacing a draft', async () => {
  const storage = new MemoryStorage();
  let event!: () => void;
  let removed = false;
  const store = createSnapshotStore({
    storage: () => storage, locks: new SerialLocks(), newStoreId: () => 'store-1',
    changes: { subscribe: (listener) => { event = listener; return () => { removed = true; }; } },
  });
  const notifications: unknown[] = [];
  const off = store.subscribe((change) => notifications.push(change));
  storage.setItem(ASSET_KEY, '{broken');
  assert.equal(typeof event, 'function');
  event();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(notifications, [{ version: null, requiresReload: true }]);
  assert.equal(storage.getItem(ASSET_KEY), '{broken');
  off();
  assert.equal(removed, true);
});

test('post-write byte mismatch is uncertain and never attempts a destructive rollback', async () => {
  class InterferedStorage extends MemoryStorage {
    override setItem(key: string, value: string) {
      super.setItem(key, value);
      super.setItem(key, '{non-cooperative-writer');
    }
  }
  const { store, storage } = setup(new InterferedStorage());
  const result = await store.commit(null, emptySnapshot(), 'c1', 1);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'COMMIT_UNCERTAIN');
  assert.equal(storage.getItem(ASSET_KEY), '{non-cooperative-writer');
});

test('invalid metadata and exhausted revisions never change persisted bytes', async () => {
  const { store, storage, version } = await seed();
  const original = storage.getItem(ASSET_KEY);
  for (const [commandId, at] of [['', 2], ['c2', NaN], ['c2', -1], ['commit-1', 2]] as const) {
    const result = await store.commit(version, emptySnapshot(), commandId, at);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'INVALID_INPUT');
    assert.equal(storage.getItem(ASSET_KEY), original);
  }
  const envelope = JSON.parse(original!);
  envelope.version.revision = Number.MAX_SAFE_INTEGER;
  storage.setItem(ASSET_KEY, JSON.stringify(envelope));
  const result = await store.commit(envelope.version, emptySnapshot(), 'c2', 2);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'INVALID_INPUT');
  assert.equal(JSON.parse(storage.getItem(ASSET_KEY)!).version.revision, Number.MAX_SAFE_INTEGER);
});

test('failed notification registration does not retain an unreachable subscriber', async () => {
  let called = 0;
  const storage = new MemoryStorage();
  const store = createSnapshotStore({
    storage: () => storage, locks: new SerialLocks(), newStoreId: () => 'store-1',
    changes: { subscribe: () => { throw new Error('Registration denied'); } },
  });
  assert.throws(() => store.subscribe(() => { called++; }), /Registration denied/);
  const result = await store.commit(null, emptySnapshot(), 'c1', 1);
  assert.equal(result.ok, true);
  assert.equal(called, 0);
});
