import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Result, Revision } from '../../src/domain/assets/model';
import { createJsonImportService } from '../../src/services/import-export/json-import-service';
import type { ImportContext, ImportDocument, ImportOptions } from '../../src/services/import-export/model';
import { ASSET_KEY, createSnapshotStore } from '../../src/services/persistence/snapshot-store';
import { bookmarkSnapshot, emptySnapshot } from '../support/asset-fixtures';
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
function take<T>(result: Result<T>): T {
  if (!result.ok) assert.fail(JSON.stringify(result));
  return result.value;
}
function code(result: Result<unknown>, expected: string) {
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, expected, JSON.stringify(result));
}
function document(): ImportDocument {
  return {
    format: 'json', notices: [], collections: [],
    roots: [{
      kind: 'bookmark', sourceId: 'external',
      input: { title: 'Imported', url: 'https://example.org/', icon: null, notes: 'Private', keywords: ['photo'] },
    }],
  };
}
function options(): ImportOptions {
  return {
    target: { kind: 'existing', folderId: null },
    duplicateBookmarks: 'skip', duplicateCollections: 'skip-identical',
    folderBindings: [], missingParents: 'reject', missingBookmarkLinks: 'reject',
  };
}
function context(base = emptySnapshot(), expected: Revision | null = null, previewId = 'preview'): ImportContext {
  return { base, expected, previewId, at: 10, candidateIds: ['imported'] };
}
function setup(locked = true) {
  const locks = new SerialLocks();
  const writes: { key: string; held: boolean }[] = [];
  class ObservedStorage extends MemoryStorage {
    override setItem(key: string, value: string) {
      writes.push({ key, held: locks.held });
      super.setItem(key, value);
    }
  }
  const storage = new ObservedStorage();
  const store = createSnapshotStore({ storage: () => storage, locks: locked ? locks : null, newStoreId: () => 'store' });
  const service = createJsonImportService(store);
  return { storage, store, service, locks, writes };
}

test('JSON preview is write-free; confirmed import writes once under the asset lock', async () => {
  const { service, storage, writes, store } = setup();
  const preview = take(service.preview(document(), options(), context()));
  assert.equal(storage.length, 0);
  assert.deepEqual(writes, []);
  const report = take(await service.commit(preview));
  assert.deepEqual(writes, [{ key: ASSET_KEY, held: true }]);
  assert.equal(report.receipt.envelope.version.revision, 1);
  assert.equal(report.receipt.envelope.version.commitId, 'preview');
  assert.deepEqual(report.receipt.envelope.snapshot, preview.next);
  assert.deepEqual(report.mappings, preview.mappings);
  assert.ok(report.receipt.affectedIds.includes('imported'));
  assert.equal(take(await store.read()).kind, 'ready');
});

test('commit rejects a modified candidate without writing', async () => {
  const { service, storage } = setup();
  const preview = take(service.preview(document(), options(), context()));
  preview.next.library.bookmarks[0].notes = 'Forged';
  code(await service.commit(preview), 'IMPORT_INVALID');
  assert.equal(storage.length, 0);
});

test('commit rejects modified source document, options, counts, mappings or metadata', async () => {
  const changes: ((preview: ReturnType<typeof takePreview>) => void)[] = [
    p => { p.document.roots = []; },
    p => { p.options.duplicateBookmarks = 'keep'; },
    p => { p.counts.created = 900; },
    p => { p.mappings[0].targetId = 'forged'; },
    p => { p.previewId = 'foreign'; },
    p => { p.expected = { storeId: 'fake', revision: 1, commitId: 'fake' }; },
    p => { p.notices.push({ code: 'FAKE', details: {} }); },
  ];
  for (const change of changes) {
    const { service, storage } = setup();
    const preview = takePreview(service);
    change(preview);
    code(await service.commit(preview), 'IMPORT_INVALID');
    assert.equal(storage.length, 0);
  }
});
function takePreview(service: ReturnType<typeof createJsonImportService>) {
  return take(service.preview(document(), options(), context()));
}

test('caller mutations after preview cannot alter privately retained context', async () => {
  const { service } = setup();
  const source = document();
  const policy = options();
  const ctx = context();
  const preview = take(service.preview(source, policy, ctx));
  source.roots = [];
  policy.target = { kind: 'new-container', name: 'Changed' };
  ctx.at = 999;
  ctx.candidateIds[0] = 'changed';
  ctx.base.library.root = [{ kind: 'bookmark', id: 'bad' }];
  const report = take(await service.commit(preview));
  assert.equal(report.receipt.envelope.committedAt, 10);
  assert.equal(report.receipt.envelope.snapshot.library.bookmarks[0].id, 'imported');
});

test('another page changes base revision: preview becomes stale without overwriting', async () => {
  const { service, store, storage } = setup();
  const initial = take(await store.commit(null, emptySnapshot(), 'initial', 1));
  const preview = take(service.preview(document(), options(), context(initial.snapshot, initial.version)));
  take(await store.commit(initial.version, bookmarkSnapshot(), 'other', 2));
  const before = storage.getItem(ASSET_KEY);
  code(await service.commit(preview), 'PREVIEW_STALE');
  assert.equal(storage.getItem(ASSET_KEY), before);
});

test('matching revision with a fabricated base cannot erase existing assets', async () => {
  const { service, store, storage } = setup();
  const initial = take(await store.commit(null, bookmarkSnapshot(), 'initial', 1));
  const preview = take(service.preview(document(), options(), context(emptySnapshot(), initial.version)));
  const before = storage.getItem(ASSET_KEY);
  code(await service.commit(preview), 'PREVIEW_STALE');
  assert.equal(storage.getItem(ASSET_KEY), before);
});

test('a fabricated nonempty first-install base cannot inject unrelated assets', async () => {
  const { service, storage } = setup();
  const preview = take(service.preview(document(), options(), context(bookmarkSnapshot())));
  code(await service.commit(preview), 'PREVIEW_STALE');
  assert.equal(storage.length, 0);
});

test('two services submitting the same revision allow only one import', async () => {
  const { service, store } = setup();
  const other = createJsonImportService(store);
  const initial = take(await store.commit(null, emptySnapshot(), 'initial', 1));
  const left = take(service.preview(document(), options(), context(initial.snapshot, initial.version, 'left')));
  const right = take(other.preview(document(), options(), {
    ...context(initial.snapshot, initial.version, 'right'), candidateIds: ['right-imported'],
  }));
  const results = await Promise.all([service.commit(left), other.commit(right)]);
  assert.equal(results.filter(result => result.ok).length, 1);
  code(results.find(result => !result.ok)!, 'PREVIEW_STALE');
  const current = take(await store.read());
  assert.equal(current.kind, 'ready');
  if (current.kind === 'ready') assert.equal(current.envelope.snapshot.library.bookmarks.length, 1);
});

test('revision race after commit re-read still fails at the protected store commit', async () => {
  const { service, store, locks, storage } = setup();
  const initial = take(await store.commit(null, emptySnapshot(), 'initial', 1));
  const preview = take(service.preview(document(), options(), context(initial.snapshot, initial.version)));
  let release!: () => void;
  const barrier = locks.runExclusive('test', () => new Promise<void>(resolve => { release = resolve; }));
  await Promise.resolve();
  const winner = store.commit(initial.version, bookmarkSnapshot(), 'winner', 2);
  const pending = service.commit(preview);
  await Promise.resolve();
  release(); await barrier;
  take(await winner);
  code(await pending, 'PREVIEW_STALE');
  assert.equal(JSON.parse(storage.getItem(ASSET_KEY)!).version.commitId, 'winner');
});

test('queued commit captures preview before caller mutates it', async () => {
  const { service, locks } = setup();
  const preview = takePreview(service);
  let release!: () => void;
  const barrier = locks.runExclusive('test', () => new Promise<void>(resolve => { release = resolve; }));
  await Promise.resolve();
  const pending = service.commit(preview);
  preview.next.library.bookmarks[0].title = 'Changed after click';
  preview.document.roots = [];
  release(); await barrier;
  const result = take(await pending);
  assert.equal(result.receipt.envelope.snapshot.library.bookmarks[0].title, 'Imported');
});

function busy(result: Result<unknown>) {
  code(result, 'CONFLICT');
  if (!result.ok) assert.deepEqual(result.error.details, { reason: 'import-commit-in-progress' });
}

test('commit immediately refuses a replacement preview until confirmation succeeds', async () => {
  const { service, writes } = setup();
  const first = takePreview(service);
  const pending = service.commit(first);
  const replacement = service.preview(document(), options(), context(emptySnapshot(), null, 'second'));
  const report = take(await pending);
  busy(replacement);
  assert.equal(report.receipt.envelope.version.commitId, 'preview');
  assert.equal(writes.length, 1);
  const next = service.preview(document(), options(), {
    ...context(report.receipt.envelope.snapshot, report.receipt.envelope.version, 'second'),
    candidateIds: ['second-imported'],
  });
  assert.equal(next.ok, true);
});

test('commit queued behind the persistence lock refuses preview replacement without losing its ticket', async () => {
  const { service, locks, writes } = setup();
  const first = takePreview(service);
  let release!: () => void;
  const barrier = locks.runExclusive('test', () => new Promise<void>(resolve => { release = resolve; }));
  await Promise.resolve();
  const pending = service.commit(first);
  await Promise.resolve();
  const replacement = service.preview(document(), options(), context(emptySnapshot(), null, 'second'));
  const writesWhileBlocked = writes.length;
  release();
  await barrier;
  const report = take(await pending);
  busy(replacement);
  assert.equal(writesWhileBlocked, 0);
  assert.equal(report.receipt.envelope.version.commitId, 'preview');
  assert.equal(writes.length, 1);
});

test('same-instance double submit returns busy for the duplicate and writes exactly once', async () => {
  const { service, writes } = setup();
  const preview = takePreview(service);
  const pending = service.commit(preview);
  const duplicate = service.commit(structuredClone(preview));
  const [first, second] = await Promise.all([pending, duplicate]);
  take(first);
  busy(second);
  assert.equal(writes.length, 1);
  code(await service.commit(preview), 'IMPORT_INVALID');
});

test('foreign, tampered and accessor commit inputs remain invalid while a valid confirmation is pending', async () => {
  const { service, writes } = setup();
  const preview = takePreview(service);
  const pending = service.commit(preview);
  const tampered = structuredClone(preview);
  tampered.next.library.bookmarks[0].notes = 'forged';
  const foreign = structuredClone(preview);
  foreign.previewId = 'foreign';
  let reads = 0;
  const accessor = structuredClone(preview);
  Object.defineProperty(accessor, 'next', { enumerable: true, get() { reads++; return {}; } });
  const invalidResults = await Promise.all([
    service.commit(tampered), service.commit(foreign), service.commit(accessor),
  ]);
  take(await pending);
  for (const result of invalidResults) code(result, 'IMPORT_INVALID');
  assert.equal(reads, 0);
  assert.equal(writes.length, 1);
});

test('failed write releases busy, retains the original ticket for retry and allows later previews', async () => {
  const { service, storage, writes } = setup();
  const first = takePreview(service);
  storage.failWrites = true;
  const pending = service.commit(first);
  const replacement = service.preview(document(), options(), context(emptySnapshot(), null, 'second'));
  code(await pending, 'STORAGE_WRITE_FAILED');
  busy(replacement);
  assert.equal(storage.length, 0);
  storage.failWrites = false;
  const report = take(await service.commit(first));
  assert.equal(report.receipt.envelope.version.commitId, 'preview');
  assert.equal(writes.length, 2);
  assert.equal(service.preview(document(), options(), {
    ...context(report.receipt.envelope.snapshot, report.receipt.envelope.version, 'second'),
    candidateIds: ['second-imported'],
  }).ok, true);
});

test('failed reads release busy so a new preview can replace the failed ticket', async () => {
  const { service, storage } = setup();
  const first = takePreview(service);
  storage.failReads = true;
  const pending = service.commit(first);
  const blocked = service.preview(document(), options(), context(emptySnapshot(), null, 'second'));
  code(await pending, 'STORAGE_UNAVAILABLE');
  busy(blocked);
  storage.failReads = false;
  const second = take(service.preview(document(), options(), context(emptySnapshot(), null, 'second')));
  code(await service.commit(first), 'IMPORT_INVALID');
  take(await service.commit(second));
});

for (const phase of ['read', 'commit'] as const) {
  test(`unexpected store ${phase} rejection releases busy and leaves the ticket retryable`, async () => {
    const { store } = setup();
    let reject = true;
    const service = createJsonImportService({
      ...store,
      async [phase](...args: unknown[]) {
        if (reject) throw new Error(`unexpected-${phase}`);
        if (phase === 'read') return store.read();
        return Reflect.apply(store.commit, store, args);
      },
    });
    const first = takePreview(service);
    const pending = service.commit(first);
    const blocked = service.preview(document(), options(), context(emptySnapshot(), null, 'second'));
    await assert.rejects(pending, new RegExp(`unexpected-${phase}`));
    busy(blocked);
    reject = false;
    take(await service.commit(first));
  });
}

test('successful preview replaces the previous ticket; failed preview does not', async () => {
  const { service } = setup();
  const first = takePreview(service);
  const second = take(service.preview(document(), options(), context(emptySnapshot(), null, 'second')));
  code(await service.commit(first), 'IMPORT_INVALID');
  const bad = service.preview(document(), options(), { ...context(), candidateIds: [] });
  assert.equal(bad.ok, false);
  take(await service.commit(second));
  code(await service.commit(second), 'IMPORT_INVALID');
});

test('a preview from another service instance is not a valid confirmation ticket', async () => {
  const { service, store, storage } = setup();
  const foreign = createJsonImportService(store);
  const preview = takePreview(service);
  code(await foreign.commit(preview), 'IMPORT_INVALID');
  assert.equal(storage.length, 0);
});

test('write failure preserves preview for explicit retry and never notifies success', async () => {
  const { service, store, storage } = setup();
  const preview = takePreview(service);
  let notifications = 0;
  store.subscribe(() => { notifications++; });
  storage.failWrites = true;
  code(await service.commit(preview), 'STORAGE_WRITE_FAILED');
  assert.equal(storage.length, 0);
  assert.equal(notifications, 0);
  storage.failWrites = false;
  take(await service.commit(preview));
  assert.equal(notifications, 1);
});

test('missing Web Locks refuses import without creating any keys', async () => {
  const { service, storage } = setup(false);
  const preview = takePreview(service);
  code(await service.commit(preview), 'LOCK_UNAVAILABLE');
  assert.equal(storage.length, 0);
});

test('legacy state still requires explicit migration and cannot be bypassed by JSON import', async () => {
  const { service, storage } = setup();
  storage.setItem('jipage_bookmarks_v1', '[]');
  const preview = takePreview(service);
  code(await service.commit(preview), 'LEGACY_REQUIRES_PREVIEW');
  assert.equal(storage.getItem(ASSET_KEY), null);
  assert.equal(storage.getItem('jipage_bookmarks_v1'), '[]');
});

test('corrupted current data stays byte-for-byte intact on import attempt', async () => {
  const { service, storage } = setup();
  const preview = takePreview(service);
  storage.setItem(ASSET_KEY, '{broken');
  code(await service.commit(preview), 'CORRUPT_DATA');
  assert.equal(storage.getItem(ASSET_KEY), '{broken');
});

test('commit input boundary rejects getters without invoking them', async () => {
  const { service, storage } = setup();
  const preview = takePreview(service);
  let accessed = false;
  Object.defineProperty(preview, 'next', { enumerable: true, get() { accessed = true; throw new Error('getter'); } });
  code(await service.commit(preview), 'IMPORT_INVALID');
  assert.equal(accessed, false);
  assert.equal(storage.length, 0);
});

test('parsing through the JSON service accepts exported empty assets', () => {
  const { service } = setup();
  const doc = take(service.parseJson(JSON.stringify({
    format: 'jigeqiu-assets', schemaVersion: 1, scope: 'all', exportedAt: 1,
    library: emptySnapshot().library, collections: [],
  })));
  assert.deepEqual(doc.roots, []);
  assert.deepEqual(doc.collections, []);
});

test('quota rejection preserves all existing keys and reports no saved import', async () => {
  const storage = new MemoryStorage({ maxBytes: 200 });
  storage.setItem('jigeqiu_settings_v1', 'unchanged');
  const locks = new SerialLocks();
  const store = createSnapshotStore({ storage: () => storage, locks, newStoreId: () => 'store' });
  const service = createJsonImportService(store);
  const preview = takePreview(service);
  code(await service.commit(preview), 'QUOTA_EXCEEDED');
  assert.equal(storage.getItem(ASSET_KEY), null);
  assert.equal(storage.getItem('jigeqiu_settings_v1'), 'unchanged');
});

test('import never writes settings, history, desktop or Dock from an exchange', async () => {
  const { service, storage, writes } = setup();
  storage.setItem('jigeqiu_settings_v1', '{"defaultEngineId":"mine"}');
  storage.setItem('jigeqiu_history_v1', '{"searches":[]}');
  const initialWrites = writes.length;
  const parsed = take(service.parseJson(JSON.stringify({
    format: 'jigeqiu-assets', schemaVersion: 1, scope: 'all', exportedAt: 1,
    library: bookmarkSnapshot().library, collections: [],
    settings: { defaultEngineId: 'unwanted' }, history: { searches: ['leak'] },
    layout: { shortcuts: ['unwanted'] },
  })));
  assert.ok(parsed.notices.length > 0);
  const preview = take(service.preview(parsed, options(), context()));
  const report = take(await service.commit(preview));
  assert.equal(storage.getItem('jigeqiu_settings_v1'), '{"defaultEngineId":"mine"}');
  assert.equal(storage.getItem('jigeqiu_history_v1'), '{"searches":[]}');
  assert.deepEqual(writes.slice(initialWrites), [{ key: ASSET_KEY, held: true }]);
  assert.deepEqual(report.receipt.envelope.snapshot.layout, emptySnapshot().layout);
});

test('uncertain post-write verification is explicit and does not replay the import', async () => {
  class UncertainStorage extends MemoryStorage {
    breakVerification = true;
    writes = 0;
    override setItem(key: string, value: string) {
      this.writes++;
      super.setItem(key, value);
      if (this.breakVerification) this.failReads = true;
    }
  }
  const storage = new UncertainStorage();
  const locks = new SerialLocks();
  const store = createSnapshotStore({ storage: () => storage, locks, newStoreId: () => 'store' });
  const service = createJsonImportService(store);
  const preview = takePreview(service);
  code(await service.commit(preview), 'COMMIT_UNCERTAIN');
  assert.equal(storage.writes, 1);
  storage.failReads = false;
  storage.breakVerification = false;
  const raw = storage.getItem(ASSET_KEY);
  code(await service.commit(preview), 'PREVIEW_STALE');
  assert.equal(storage.writes, 1);
  assert.equal(storage.getItem(ASSET_KEY), raw);
});

test('64 nested exported library folders can be parsed, previewed and committed again', async () => {
  const { service } = setup();
  const library = emptySnapshot().library;
  for (let index = 0; index < 64; index++) {
    library.folders.push({
      id: `source-folder-${index}`, name: 'Folder', createdAt: 1, updatedAt: 1,
      children: index === 63 ? [] : [{ kind: 'folder', id: `source-folder-${index + 1}` }],
    });
  }
  library.root.push({ kind: 'folder', id: 'source-folder-0' });
  const parsed = take(service.parseJson(JSON.stringify({
    format: 'jigeqiu-assets', schemaVersion: 1, scope: 'all', exportedAt: 1, library, collections: [],
  })));
  const preview = take(service.preview(parsed, options(), {
    ...context(), candidateIds: Array.from({ length: 64 }, (_, index) => `target-folder-${index}`),
  }));
  const report = take(await service.commit(preview));
  assert.equal(report.receipt.envelope.snapshot.library.folders.length, 64);
  assert.deepEqual(report.receipt.envelope.snapshot.library.folders[62].children, [
    { kind: 'folder', id: 'target-folder-63' },
  ]);
});
