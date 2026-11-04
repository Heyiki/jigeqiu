import assert from 'node:assert/strict';
import test from 'node:test';
import { withSearchEngineMutation } from '../../src/services/search-engine-mutation';

test('engine mutations hold a shared exclusive lock around reading and committing', async () => {
  const names: string[] = [];
  let tail = Promise.resolve();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    locks: { request(name: string, action: () => unknown) {
      names.push(name);
      const pending = tail.then(action);
      tail = pending.then(() => undefined);
      return pending;
    } },
  } });
  const values: string[] = [];
  await Promise.all(['custom', 'presets', 'edit', 'delete'].map(value => withSearchEngineMutation(() => {
    const baseline = [...values];
    values.splice(0, values.length, ...baseline, value);
  }, () => true)));
  assert.deepEqual(values, ['custom', 'presets', 'edit', 'delete']);
  assert.equal(new Set(names).size, 1);
  assert.equal(names[0], 'jigeqiu:prototype:search-engines');
});

test('queued engine mutations cannot commit after their editor closes', async () => {
  let execute: (() => unknown) | undefined;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    locks: { request: async (_name: string, action: () => unknown) => { execute = action; } },
  } });
  let current = true;
  let called = false;
  await withSearchEngineMutation(() => { called = true; }, () => current);
  current = false;
  assert.throws(() => execute!(), /CANCELLED/);
  assert.equal(called, false);
});

test('missing locks reject before touching engine data', async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  let called = false;
  await assert.rejects(withSearchEngineMutation(() => { called = true; }, () => true), /LOCK_UNAVAILABLE/);
  assert.equal(called, false);
});
