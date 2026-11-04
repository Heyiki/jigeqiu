import assert from 'node:assert/strict';
import test from 'node:test';
import { withCollectionMutation } from '../../src/services/collection-mutation';

async function navigatorWith(locks: unknown, run: () => Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks } });
  try { await run(); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
}

test('collection write participates in the existing import lock and executes only once granted', async () => {
  let grant!: () => void, calls = 0, seen = '';
  await navigatorWith({ request: (name: string, action: () => number) => {
    seen = name;
    return new Promise<number>(resolve => { grant = () => resolve(action()); });
  } }, async () => {
    const result = withCollectionMutation(() => ++calls, () => true);
    assert.equal(calls, 0);
    assert.equal(seen, 'jigeqiu:prototype:library-import');
    grant();
    assert.equal(await result, 1);
  });
});

test('leaving a collection session permanently cancels its queued write even after a new session opens', async () => {
  let grant!: () => void, calls = 0;
  const oldSession = { active: true };
  await navigatorWith({ request: (_name: string, action: () => void) => new Promise<void>((resolve, reject) => {
    grant = () => { try { action(); resolve(); } catch (error) { reject(error); } };
  }) }, async () => {
    const result = withCollectionMutation(() => { calls++; }, () => oldSession.active);
    oldSession.active = false;
    const newSession = { active: true };
    grant();
    await assert.rejects(result, /CANCELLED/);
    assert.equal(calls, 0);
    assert.equal(newSession.active, true);
  });
});

test('unavailable locks reject without writing and storage conflicts propagate to retained drafts', async () => {
  let calls = 0;
  await navigatorWith(undefined, async () => {
    await assert.rejects(withCollectionMutation(() => ++calls, () => true), /LOCK_UNAVAILABLE/);
    assert.equal(calls, 0);
  });
  await navigatorWith({ request: async (_: string, action: () => void) => action() }, async () => {
    await assert.rejects(withCollectionMutation(() => { throw new Error('CONFLICT'); }, () => true), /CONFLICT/);
  });
});
