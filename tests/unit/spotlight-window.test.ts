import assert from 'node:assert/strict';
import test from 'node:test';
import { spotlightWindow, spotlightScrollTarget, SPOTLIGHT_ROW_HEIGHT } from '../../src/components/desktop/spotlight-window';

test('result window bounds work without dropping any searchable items', () => {
  assert.deepEqual(spotlightWindow(0, 0, 500), { start: 0, end: 0 });
  assert.deepEqual(spotlightWindow(3, 0, 500), { start: 0, end: 3 });
  const head = spotlightWindow(1201, 0, 600);
  assert.equal(head.start, 0);
  assert.ok(head.end < 20);
  const tail = spotlightWindow(1201, 1201 * SPOTLIGHT_ROW_HEIGHT, 600);
  assert.equal(tail.end, 1201);
  assert.ok(tail.end - tail.start < 20);
  const middle = spotlightWindow(1201, 600 * SPOTLIGHT_ROW_HEIGHT, 600);
  assert.ok(middle.start < 600 && middle.end > 608);
});

test('keyboard scroll targets expose head and tail while preserving visible rows', () => {
  const height = SPOTLIGHT_ROW_HEIGHT;
  assert.equal(spotlightScrollTarget(0, 500, 600), 0);
  assert.equal(spotlightScrollTarget(2, 0, 600), 0);
  assert.equal(spotlightScrollTarget(1200, 0, 600), 1201 * height - 600);
});
