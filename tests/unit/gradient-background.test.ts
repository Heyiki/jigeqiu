import assert from 'node:assert/strict';
import test from 'node:test';
import { gradientImage, normalizeGradient } from '../../src/services/gradient-background';

test('gradient backgrounds produce a two-color CSS image with a normalized direction', () => {
  assert.equal(gradientImage({ start: '#123456', end: '#ABCDEF', angle: 90 }),
    'linear-gradient(90deg, #123456, #ABCDEF)');
  assert.equal(gradientImage({ start: '#123456', end: '#654321', angle: -45 }),
    'linear-gradient(315deg, #123456, #654321)');
  assert.equal(normalizeGradient({ angle: 450 }).angle, 90);
});

test('missing or malformed gradient preferences use safe colors and direction', () => {
  const fallback = { start: '#3b6b89', end: '#a9c7c5', angle: 135 };
  assert.deepEqual(normalizeGradient(), fallback);
  assert.deepEqual(normalizeGradient(null), fallback);
  assert.deepEqual(normalizeGradient({ start: 'url(https://example.com)', end: '#fff', angle: NaN }), fallback);
  assert.deepEqual(normalizeGradient({ start: '', end: 'red', angle: Infinity }), fallback);
});
