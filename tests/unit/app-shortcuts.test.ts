import assert from 'node:assert/strict';
import test from 'node:test';
import { appShortcut, SHORTCUTS } from '../../src/components/desktop/app-shortcuts';

const key = (overrides: Record<string, unknown> = {}) => ({
  key: 'k', code: 'KeyK', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false,
  repeat: false, isComposing: false, keyCode: 0, defaultPrevented: false, ...overrides,
});

test('shared shortcut definitions match the three approved panel actions', () => {
  for (const modifier of [{ ctrlKey: true }, { ctrlKey: false, metaKey: true }]) {
    assert.equal(appShortcut(key(modifier)), 'search');
    assert.equal(appShortcut(key({ ...modifier, key: ' ', code: 'Space', shiftKey: true })), 'launchpad');
    assert.equal(appShortcut(key({ ...modifier, key: 'Enter', code: 'Enter', shiftKey: true })), 'add');
  }
  assert.equal(SHORTCUTS.length, 3);
});

test('native browser chords and unsafe events are never app shortcuts', () => {
  for (const overrides of [{ key: 'n' }, { key: 's' }, { shiftKey: true }, { altKey: true },
    { repeat: true }, { isComposing: true }, { keyCode: 229 }, { defaultPrevented: true },
    { ctrlKey: false }, { metaKey: true }]) {
    assert.equal(appShortcut(key(overrides)), null);
  }
});
