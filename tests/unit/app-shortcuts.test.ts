import assert from 'node:assert/strict';
import test from 'node:test';
import { appShortcut, createDoubleShiftTracker, SHORTCUTS } from '../../src/components/desktop/app-shortcuts';

const key = (overrides: Record<string, unknown> = {}) => ({
  key: 'k', code: 'KeyK', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false,
  repeat: false, isComposing: false, keyCode: 0, defaultPrevented: false, timeStamp: 0, ...overrides,
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

const shift = (timeStamp: number, overrides: Record<string, unknown> = {}) =>
  key({ key: 'Shift', ctrlKey: false, shiftKey: true, timeStamp, ...overrides });

test('two short Shift taps open search once, with either Shift key', () => {
  const tracker = createDoubleShiftTracker();
  assert.equal(tracker.handle(shift(0), 'keydown'), false);
  assert.equal(tracker.handle(shift(50, { shiftKey: false }), 'keyup'), false);
  assert.equal(tracker.handle(shift(200, { code: 'ShiftRight' }), 'keydown'), false);
  assert.equal(tracker.handle(shift(250, { shiftKey: false, code: 'ShiftRight' }), 'keyup'), true);
  assert.equal(tracker.handle(shift(300), 'keydown'), false);
  assert.equal(tracker.handle(shift(350, { shiftKey: false }), 'keyup'), false);
});

test('Shift chords, held keys, repeats, unsafe contexts and expired taps cannot trigger', () => {
  for (const interrupt of [
    () => shift(100, { key: 'Tab' }),
    () => shift(100, { repeat: true }),
    () => shift(100, { ctrlKey: true }),
    () => shift(100, { metaKey: true }),
    () => shift(100, { altKey: true }),
    () => shift(100, { isComposing: true }),
    () => shift(100, { keyCode: 229 }),
    () => shift(100, { defaultPrevented: true }),
  ]) {
    const tracker = createDoubleShiftTracker();
    tracker.handle(shift(0), 'keydown');
    tracker.handle(shift(40), 'keyup');
    tracker.handle(interrupt(), 'keydown');
    assert.equal(tracker.handle(shift(120), 'keyup'), false);
  }
  for (const [release, secondDown] of [[600, 650], [40, 700]]) {
    const tracker = createDoubleShiftTracker();
    tracker.handle(shift(0), 'keydown');
    tracker.handle(shift(release), 'keyup');
    tracker.handle(shift(secondDown), 'keydown');
    assert.equal(tracker.handle(shift(secondDown + 40), 'keyup'), false);
  }
  const tracker = createDoubleShiftTracker();
  tracker.handle(shift(0), 'keydown');
  tracker.handle(shift(40), 'keyup');
  tracker.reset();
  tracker.handle(shift(100), 'keydown');
  assert.equal(tracker.handle(shift(140), 'keyup'), false);
  tracker.handle(shift(200), 'keydown', false);
  assert.equal(tracker.handle(shift(240), 'keyup'), false);
});
