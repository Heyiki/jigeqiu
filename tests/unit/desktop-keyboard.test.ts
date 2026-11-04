import assert from 'node:assert/strict';
import test from 'node:test';
import { desktopPageKeyStep } from '../../src/components/desktop/desktop-keyboard';

const event = {
  key: 'ArrowRight', defaultPrevented: false, repeat: false, isComposing: false,
  keyCode: 39, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
};

test('ordinary left and right presses turn one page without requiring a grid-focused event', () => {
  assert.equal(desktopPageKeyStep(event, false), 1);
  assert.equal(desktopPageKeyStep({ ...event, key: 'ArrowLeft' }, false), -1);
  for (const key of ['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape']) {
    assert.equal(desktopPageKeyStep({ ...event, key }, false), 0);
  }
});

test('input focus, overlays and other blocked desktop states retain their direction keys', () => {
  assert.equal(desktopPageKeyStep(event, true), 0);
  assert.equal(desktopPageKeyStep({ ...event, key: 'ArrowLeft' }, true), 0);
  assert.equal(desktopPageKeyStep({ ...event, defaultPrevented: true }, false), 0);
});

test('holding a key does not repeatedly page and composition or modified keys remain native', () => {
  for (const field of ['repeat', 'isComposing', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const) {
    assert.equal(desktopPageKeyStep({ ...event, [field]: true }, false), 0, field);
  }
  assert.equal(desktopPageKeyStep({ ...event, keyCode: 229 }, false), 0);
});
