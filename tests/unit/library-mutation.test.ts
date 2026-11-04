import assert from 'node:assert/strict';
import test from 'node:test';
import { commitAndRefresh } from '../../src/services/library-mutation';

test('a library command commits once before a pure refresh and returns its result', () => {
  const calls: string[] = [];
  const value = commitAndRefresh(() => { calls.push('commit'); return { id: 'created' }; },
    () => { calls.push('refresh'); });
  assert.deepEqual(calls, ['commit', 'refresh']);
  assert.deepEqual(value, { id: 'created' });
});

test('failed commit preserves the original error and never refreshes', () => {
  const cause = new DOMException('Full', 'QuotaExceededError');
  let refreshed = false;
  assert.throws(() => commitAndRefresh(() => { throw cause; }, () => { refreshed = true; }), error => error === cause);
  assert.equal(refreshed, false);
});

test('refresh failure after a successful commit is uncertain and never repeats the write', () => {
  let writes = 0;
  assert.throws(() => commitAndRefresh(() => { writes++; }, () => {
    throw new DOMException('Read blocked', 'SecurityError');
  }), /COMMIT_UNCERTAIN/);
  assert.equal(writes, 1);
});
