import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ONBOARDING_KEY,
  claimWelcome,
  createProgressStore,
  detectNewUser,
  mergeProgress,
  parseProgress,
  readProgress,
  updateProgressLocked,
  writeProgress,
  type Progress,
  type ProgressPatch,
  type ProgressWriteResult,
  type WelcomeClaimResult,
} from '../../src/components/onboarding/progress';
import { MemoryStorage } from '../support/memory-storage';

function emptyProgress(): Progress {
  return {
    version: 1,
    welcomeShown: false,
    welcomeSkipped: false,
    tourCompleted: false,
    tasks: { import: false, add: false, pin: false },
    backupReminderShown: false,
  };
}

function queuedWelcomeLocks() {
  const queue: Array<() => Promise<void>> = [];
  const locks: Pick<LockManager, 'request'> = {
    request: ((name: string, options: LockOptions, callback: LockGrantedCallback<WelcomeClaimResult>) => {
      assert.equal(name, 'jigeqiu:onboarding-progress');
      assert.equal(options.mode, 'exclusive');
      return new Promise<WelcomeClaimResult>((resolve, reject) => {
        queue.push(async () => {
          try { resolve(await callback({ name, mode: 'exclusive' })); }
          catch (error) { reject(error); }
        });
      });
    }) as LockManager['request'],
  };
  return { locks, queue };
}

test('two fresh tabs claim welcome under one lock and exactly one may show it', async () => {
  const storage = new MemoryStorage();
  // Initializers already ran: these keys must not disqualify a pre-screened new user.
  storage.setItem('jipage_settings_v1', '{}');
  storage.setItem('jipage_library_v2', '[]');
  const { locks, queue } = queuedWelcomeLocks();
  let reads = 0;
  const get = storage.getItem.bind(storage);
  storage.getItem = key => { reads++; return get(key); };
  const first = claimWelcome(storage, locks);
  const second = claimWelcome(storage, locks);
  assert.equal(reads, 0);
  assert.equal(queue.length, 2);
  await queue.shift()!();
  const winner = await first;
  assert.deepEqual(winner, {
    claimed: true, progress: { ...emptyProgress(), welcomeShown: true },
  });
  const before = storage.getItem(ONBOARDING_KEY);
  let writes = 0;
  storage.setItem = () => { writes++; throw new Error('loser must not write'); };
  await queue.shift()!();
  assert.deepEqual(await second, { claimed: false, progress: winner.progress });
  assert.equal(writes, 0);
  assert.equal(storage.getItem(ONBOARDING_KEY), before);
});

test('welcome claim rejects any existing record even if welcomeShown is false', async () => {
  for (const raw of [JSON.stringify(emptyProgress()), '', '{"version":2}']) {
    const storage = new MemoryStorage();
    storage.setItem(ONBOARDING_KEY, raw);
    const { locks, queue } = queuedWelcomeLocks();
    const pending = claimWelcome(storage, locks);
    await queue.shift()!();
    const result = await pending;
    assert.equal(result.claimed, false);
    assert.equal(result.error, raw.startsWith('{"version":1') ? undefined : 'INVALID_RECORD');
    assert.equal(storage.getItem(ONBOARDING_KEY), raw);
  }
});

test('welcome claim fails closed on missing locks, read denial, write failure and uncertain commit', async () => {
  const missing = new MemoryStorage();
  assert.deepEqual(await claimWelcome(missing, undefined), {
    claimed: false, error: 'LOCK_UNAVAILABLE',
  });
  assert.equal(missing.length, 0);
  const rejected: Pick<LockManager, 'request'> = {
    request: () => Promise.reject(new Error('denied')),
  };
  assert.deepEqual(await claimWelcome(missing, rejected), {
    claimed: false, error: 'LOCK_UNAVAILABLE',
  });
  for (const failure of ['read', 'write', 'uncertain'] as const) {
    const storage = new MemoryStorage();
    if (failure === 'read') storage.failReads = true;
    if (failure === 'write') storage.failWrites = true;
    if (failure === 'uncertain') storage.setItem = () => {};
    const { locks, queue } = queuedWelcomeLocks();
    const pending = claimWelcome(storage, locks);
    await queue.shift()!();
    const result = await pending;
    assert.equal(result.claimed, false);
    assert.equal(result.error, {
      read: 'STORAGE_UNAVAILABLE', write: 'WRITE_FAILED', uncertain: 'COMMIT_UNCERTAIN',
    }[failure]);
    assert.equal(result.progress, undefined, 'failed claims must not publish fallback progress');
    assert.equal(storage.length, 0);
  }
});

test('locked concurrent updates read only after grant and preserve both tabs flags', async () => {
  const storage = new MemoryStorage();
  const get = storage.getItem.bind(storage);
  let reads = 0;
  storage.getItem = key => { reads++; return get(key); };
  const queue: Array<() => Promise<void>> = [];
  const requests: Array<{ name: string; mode: LockMode | undefined }> = [];
  const locks: Pick<LockManager, 'request'> = {
    request: ((name: string, options: LockOptions, callback: LockGrantedCallback<ProgressWriteResult>) => {
      requests.push({ name, mode: options.mode });
      return new Promise<ProgressWriteResult>((resolve, reject) => {
        queue.push(async () => {
          try { resolve(await callback({ name, mode: 'exclusive' })); }
          catch (error) { reject(error); }
        });
      });
    }) as LockManager['request'],
  };
  const first = updateProgressLocked(storage, {
    welcomeShown: true, tasks: { import: true },
  }, locks);
  const second = updateProgressLocked(storage, {
    tourCompleted: true, tasks: { add: true, pin: true },
  }, locks);
  assert.equal(reads, 0, 'queued updates must not capture a stale baseline');
  assert.equal(storage.length, 0);
  assert.deepEqual(requests, [
    { name: 'jigeqiu:onboarding-progress', mode: 'exclusive' },
    { name: 'jigeqiu:onboarding-progress', mode: 'exclusive' },
  ]);
  assert.equal(queue.length, 2);
  await queue.shift()!();
  assert.equal((await first).ok, true);
  assert.equal(readProgress(storage).progress.tasks.add, false);
  await queue.shift()!();
  const result = await second;
  assert.equal(result.ok, true);
  assert.deepEqual(result.progress, {
    ...emptyProgress(), welcomeShown: true, tourCompleted: true,
    tasks: { import: true, add: true, pin: true },
  });
  assert.deepEqual(readProgress(storage).progress, result.progress);
});

test('missing or rejected locks never write and return LOCK_UNAVAILABLE', async () => {
  const storage = new MemoryStorage();
  writeProgress(storage, { welcomeShown: true });
  const before = storage.getItem(ONBOARDING_KEY);
  let writes = 0;
  storage.setItem = () => { writes++; throw new Error('must not write'); };
  const rejected: Pick<LockManager, 'request'> = {
    request: () => Promise.reject(new Error('denied')),
  };
  const throwing: Pick<LockManager, 'request'> = {
    request: () => { throw new Error('unavailable'); },
  };
  for (const locks of [undefined, rejected, throwing]) {
    const result = await updateProgressLocked(storage, { tasks: { pin: true } }, locks);
    assert.equal(result.ok, false);
    assert.equal(result.writable, false);
    assert.equal(result.error, 'LOCK_UNAVAILABLE');
    assert.equal(result.progress.welcomeShown, true);
    assert.equal(result.progress.tasks.pin, false);
  }
  assert.equal(writes, 0);
  assert.equal(storage.getItem(ONBOARDING_KEY), before);
});

test('missing progress reads safely without initializing storage', () => {
  const storage = new MemoryStorage();
  assert.deepEqual(readProgress(storage), {
    progress: emptyProgress(), writable: true, exists: false,
  });
  assert.equal(storage.length, 0);
  const first = readProgress(storage);
  first.progress.tasks.add = true;
  assert.equal(readProgress(storage).progress.tasks.add, false);
});

test('writes persist only versioned boolean flags and survive a fresh store', () => {
  const storage = new MemoryStorage();
  const result = writeProgress(storage, { welcomeShown: true, tasks: { add: true } });
  assert.equal(result.ok, true);
  assert.equal(result.exists, true);
  assert.deepEqual(JSON.parse(storage.getItem('jigeqiu_onboarding_v1')!), {
    ...emptyProgress(), welcomeShown: true, tasks: { import: false, add: true, pin: false },
  });
  assert.deepEqual(createProgressStore(storage).read().progress, result.progress);
  assert.equal(storage.length, 1);
});

test('pure merge unions every flag without mutating inputs', () => {
  const original = emptyProgress();
  const patch: ProgressPatch = {
    welcomeShown: true, welcomeSkipped: true, tourCompleted: true,
    tasks: { import: true, add: true, pin: true }, backupReminderShown: true,
  };
  const complete = mergeProgress(original, patch);
  assert.deepEqual(complete, {
    version: 1, welcomeShown: true, welcomeSkipped: true, tourCompleted: true,
    tasks: { import: true, add: true, pin: true }, backupReminderShown: true,
  });
  assert.deepEqual(original, emptyProgress());
  assert.deepEqual(mergeProgress(complete, emptyProgress()), complete);
  assert.notEqual(mergeProgress(original, {}).tasks, original.tasks);
});

test('strict parser rejects corrupt, unknown and incomplete records without normalizing them', () => {
  const valid = emptyProgress();
  assert.deepEqual(parseProgress(JSON.stringify(valid)), valid);
  for (const raw of [
    null, '', '{', 'null', '[]', 'false', '{}',
    JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({ ...valid, welcomeShown: 1 }),
    JSON.stringify({ ...valid, tasks: { import: false, add: false } }),
    JSON.stringify({ ...valid, tasks: { ...valid.tasks, pin: 'false' } }),
    JSON.stringify({ ...valid, url: 'https://private.invalid' }),
    JSON.stringify({ ...valid, tasks: { ...valid.tasks, id: 'private' } }),
  ]) {
    assert.equal(parseProgress(raw), null);
  }
});

test('corrupt or future records are nonwritable and retain their exact bytes', () => {
  for (const raw of ['', '{', '{"version":2}', '{"version":1,"unknown":true}']) {
    const storage = new MemoryStorage();
    storage.setItem(ONBOARDING_KEY, raw);
    assert.equal(readProgress(storage).exists, true);
    assert.equal(readProgress(storage).writable, false);
    assert.equal(writeProgress(storage, { welcomeShown: true }).ok, false);
    assert.equal(storage.getItem(ONBOARDING_KEY), raw);
    assert.equal(detectNewUser(storage), false);
  }
});

test('invalid patches including personal fields never overwrite an existing valid record', () => {
  for (const patch of [
    null, [], { version: 2 }, { name: 'private' }, { url: 'https://private.invalid' },
    { tasks: { id: 'private' } }, { tasks: { add: 'true' } },
    { tasks: null }, { welcomeShown: undefined }, { tourCompleted: 1 },
  ]) {
    const storage = new MemoryStorage();
    storage.setItem(ONBOARDING_KEY, JSON.stringify(emptyProgress()));
    const before = storage.getItem(ONBOARDING_KEY);
    const result = writeProgress(storage, patch as ProgressPatch);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'INVALID_PATCH');
    assert.equal(storage.getItem(ONBOARDING_KEY), before);
  }
});

test('two stores and stale storage events preserve already completed flags', () => {
  const storage = new MemoryStorage();
  const first = createProgressStore(storage);
  const second = createProgressStore(storage);
  const stale = first.read().progress;
  first.update({ welcomeShown: true, tasks: { import: true } });
  second.update({ welcomeSkipped: true, tasks: { add: true } });
  const external = mergeProgress(stale, { tourCompleted: true, tasks: { pin: true } });
  assert.equal(first.merge(external).ok, true);
  second.update({ welcomeShown: false, tasks: { import: false, add: false } });
  assert.deepEqual(first.read().progress, {
    ...emptyProgress(), welcomeShown: true, welcomeSkipped: true, tourCompleted: true,
    tasks: { import: true, add: true, pin: true },
  });
  assert.equal(second.merge(stale).ok, true);
  assert.equal(second.read().progress.tourCompleted, true);
});

test('read failures prevent writes and cannot identify a new user', () => {
  const storage = new MemoryStorage();
  storage.setItem(ONBOARDING_KEY, JSON.stringify(emptyProgress()));
  const before = storage.getItem(ONBOARDING_KEY);
  storage.failReads = true;
  assert.equal(readProgress(storage).writable, false);
  assert.equal(readProgress(storage).error, 'STORAGE_UNAVAILABLE');
  assert.equal(writeProgress(storage, { welcomeSkipped: true }).ok, false);
  assert.equal(detectNewUser(storage), false);
  storage.failReads = false;
  assert.equal(storage.getItem(ONBOARDING_KEY), before);
});

test('quota and denied writes return errors without publishing unpersisted flags', () => {
  const denied = new MemoryStorage();
  denied.failWrites = true;
  for (const storage of [new MemoryStorage({ maxBytes: 1 }), denied]) {
    const result = createProgressStore(storage).update({ backupReminderShown: true });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'WRITE_FAILED');
    assert.equal(result.progress.backupReminderShown, false);
    assert.equal(result.writable, false);
    assert.equal(storage.getItem(ONBOARDING_KEY), null);
  }
});

test('a failed update preserves prior progress and unrelated application bytes', () => {
  const storage = new MemoryStorage();
  storage.setItem('jipage_library_v2', '{"private":"untouched"}');
  assert.equal(writeProgress(storage, { welcomeShown: true }).ok, true);
  const before = storage.getItem(ONBOARDING_KEY);
  storage.failWrites = true;
  const result = writeProgress(storage, { tasks: { add: true } });
  assert.equal(result.ok, false);
  assert.equal(result.progress.welcomeShown, true);
  assert.equal(result.progress.tasks.add, false);
  assert.equal(storage.getItem(ONBOARDING_KEY), before);
  assert.equal(storage.getItem('jipage_library_v2'), '{"private":"untouched"}');
});

test('store rejects invalid external records instead of persisting them as partial events', () => {
  const storage = new MemoryStorage();
  const store = createProgressStore(storage);
  for (const external of [null, {}, { ...emptyProgress(), version: 2 }]) {
    const result = store.merge(external as Progress);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'INVALID_PATCH');
    assert.equal(storage.getItem(ONBOARDING_KEY), null);
  }
});

test('unverifiable writes return COMMIT_UNCERTAIN without claiming success', () => {
  for (const failure of ['readback', 'dropped', 'changed']) {
    const storage = new MemoryStorage();
    const set = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      if (failure === 'readback') { set(key, value); storage.failReads = true; }
      if (failure === 'changed') set(key, `${value} `);
    };
    const result = writeProgress(storage, { tasks: { pin: true } });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'COMMIT_UNCERTAIN');
    assert.equal(result.writable, false);
    assert.equal(result.progress.tasks.pin, false);
  }
});

test('only a profile without onboarding or relevant application keys is eligible', () => {
  const storage = new MemoryStorage();
  assert.equal(detectNewUser(storage), true);
  assert.equal(storage.length, 0);
  for (const key of [
    'jipage_library_v2', 'jipage_bookmarks_v1', 'jipage_settings_v1',
    'jipage_search_engines_v1', 'jipage_recent_searches_v1',
    'jigeqiu_assets_v1', 'jigeqiu_custom_wallpaper_v1', 'jigeqiu-custom-wallpaper-v1',
    ONBOARDING_KEY,
  ]) {
    const existing = new MemoryStorage();
    existing.setItem(key, key.includes('settings') ? '{}' : '[]');
    assert.equal(detectNewUser(existing), false, key);
  }
  storage.setItem('unrelated-site-setting', 'true');
  assert.equal(detectNewUser(storage), true);
});

test('new-user detection fails closed when enumeration is denied or unreliable', () => {
  const storage = new MemoryStorage();
  const boundary = {
    getItem: storage.getItem.bind(storage), setItem: storage.setItem.bind(storage),
    length: 1, key: () => null,
  };
  assert.equal(detectNewUser(boundary), false);
  assert.equal(detectNewUser({ ...boundary, key: () => { throw new Error('denied'); } }), false);
  assert.equal(detectNewUser({
    ...boundary, get length(): number { throw new Error('denied'); },
  }), false);
  assert.equal(detectNewUser({ ...boundary, length: NaN }), false);
  assert.equal(detectNewUser({ ...boundary, length: -1 }), false);
  assert.equal(detectNewUser({ ...boundary, length: 1.5 }), false);
  assert.equal(detectNewUser({ ...boundary, length: 2, key: () => 'duplicate' }), false);
  let reads = 0;
  assert.equal(detectNewUser({
    ...boundary, key: () => 'other', get length() { return ++reads; },
  }), false);
});
