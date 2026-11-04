import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASSET_LIMITS, captureJsonInput } from '../../src/domain/assets/validation';

function nested(depth: number): unknown {
  let value: unknown = 'leaf';
  for (let index = 0; index < depth; index++) value = { children: [value] };
  return value;
}
test('bounded import depth capture accepts a 64-folder tree without changing the default budget', () => {
  const source = nested(64);
  assert.equal(captureJsonInput(source).ok, false);
  const captured = captureJsonInput(source, ASSET_LIMITS.libraryDepth * 2 + 16);
  assert.equal(captured.ok, true, JSON.stringify(captured));
  if (captured.ok) {
    assert.deepEqual(captured.value, source);
    assert.notEqual(captured.value, source);
  }
});
test('import depth capture cannot disable the depth limit or JSON safety checks', () => {
  for (const depth of [NaN, Infinity, -1, 1.5, 10000]) {
    assert.equal(captureJsonInput({}, depth).ok, false);
  }
  assert.equal(captureJsonInput(nested(80), ASSET_LIMITS.libraryDepth * 2 + 16).ok, false);
  let invoked = false;
  const source = { get unsafe() { invoked = true; return 1; } };
  assert.equal(captureJsonInput(source, ASSET_LIMITS.libraryDepth * 2 + 16).ok, false);
  assert.equal(invoked, false);
});
