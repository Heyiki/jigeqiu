import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MemoryStorage } from '../support/memory-storage';

test('a quota failure preserves the previously stored value and other keys', () => {
  const store = new MemoryStorage({ maxBytes: 24 });
  store.setItem('a', 'old');
  store.setItem('b', 'keep');

  assert.throws(() => store.setItem('a', 'way too much data'), { name: 'QuotaExceededError' });
  assert.equal(store.getItem('a'), 'old');
  assert.equal(store.getItem('b'), 'keep');
  assert.equal(store.length, 2);
});

test('UTF-16 byte budgeting includes both keys and values', () => {
  const store = new MemoryStorage({ maxBytes: 6 });
  store.setItem('a', '图标');

  assert.throws(() => store.setItem('b', ''), { name: 'QuotaExceededError' });
  assert.equal(store.getItem('a'), '图标');
});

test('read failure is separate from a missing key and does not destroy raw data', () => {
  const store = new MemoryStorage();
  store.setItem('assets', '{broken');
  assert.equal(store.getItem('missing'), null);
  store.failReads = true;

  assert.throws(() => store.getItem('assets'), { name: 'SecurityError' });
  store.failReads = false;
  assert.equal(store.getItem('assets'), '{broken');
});

test('write denial leaves both overwrite and removal attempts unchanged', () => {
  const store = new MemoryStorage();
  store.setItem('assets', 'original');
  store.failWrites = true;

  assert.throws(() => store.setItem('assets', 'changed'), { name: 'SecurityError' });
  assert.throws(() => store.removeItem('assets'), { name: 'SecurityError' });
  assert.throws(() => store.clear(), { name: 'SecurityError' });
  assert.equal(store.getItem('assets'), 'original');
});

test('storage instances isolate fixtures and support indexed key access', () => {
  const first = new MemoryStorage();
  const second = new MemoryStorage();
  first.setItem('one', '1');
  first.setItem('two', '2');
  first.removeItem('one');

  assert.equal(first.key(0), 'two');
  assert.equal(first.key(1), null);
  assert.equal(second.length, 0);
  first.clear();
  assert.equal(first.length, 0);
});
