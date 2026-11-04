import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBrowserSnapshotStore } from '../../src/services/persistence/browser-store';
import { emptySnapshot } from '../support/asset-fixtures';
import { MemoryStorage } from '../support/memory-storage';

test('browser binding does not access denied localStorage until a read or write', async () => {
  const target = {
    get localStorage(): Storage { throw new DOMException('Denied', 'SecurityError'); },
    navigator: {}, crypto: { randomUUID: () => 'store-1' },
  } as unknown as Window;
  const store = createBrowserSnapshotStore(target);
  const result = await store.read();
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'STORAGE_UNAVAILABLE');
  assert.equal(store.capability().mode, 'read-only');
});

test('missing Web Locks never silently falls back to an unsafe browser save', async () => {
  const storage = new MemoryStorage();
  const target = {
    localStorage: storage, navigator: {}, crypto: { randomUUID: () => 'store-1' },
  } as unknown as Window;
  const store = createBrowserSnapshotStore(target);
  const result = await store.commit(null, emptySnapshot(), 'c1', 1);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'LOCK_UNAVAILABLE');
  assert.equal(storage.length, 0);
});
