import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeUrl, storage } from '../../src/services/storage';
import { MemoryStorage } from '../support/memory-storage';

// Diagnostic only: these PRD assertions intentionally expose the unmodified prototype.
test('A16: different anchors must remain distinct in duplicate comparison', () => {
  assert.notEqual(normalizeUrl('https://example.com/docs#first'), normalizeUrl('https://example.com/docs#second'));
});

test('A16: non-default ports must remain distinct in duplicate comparison', () => {
  assert.notEqual(normalizeUrl('https://example.com:8443/docs'), normalizeUrl('https://example.com/docs'));
});

test('A16: www and bare domains must not be silently equated', () => {
  assert.notEqual(normalizeUrl('https://www.example.com/'), normalizeUrl('https://example.com/'));
});

test('A18: saving must report a failure when persistent writes are denied', (context) => {
  const store = new MemoryStorage();
  store.setItem('jipage_bookmarks_v1', '[]');
  store.failWrites = true;
  context.mock.method(console, 'error', () => {});
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: store });
  context.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });

  assert.throws(() => storage.saveBookmarks([]), { name: 'SecurityError' });
});
