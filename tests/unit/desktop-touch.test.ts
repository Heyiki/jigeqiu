import assert from 'node:assert/strict';
import test from 'node:test';
import * as gestures from '../../src/components/desktop/desktop-gestures';

function begin(height = 844, touch = true) {
  assert.equal(typeof gestures.createDesktopGesture, 'function', 'Desktop supports velocity-aware pointer gestures');
  return gestures.createDesktopGesture({ x: 0, y: 0, now: 0, width: 390, height, touch });
}

test('a short deliberate flick opens search or launchpad, but tiny jitter does not', () => {
  for (const direction of [-1, 1]) {
    const gesture = begin();
    gesture.update(2, 18 * direction, 25);
    gesture.update(3, 40 * direction, 55);
    assert.equal(gesture.finish(60), direction < 0 ? 'launchpad' : 'search');
  }
  const jitter = begin();
  jitter.update(2, 12, 10);
  assert.equal(jitter.finish(12), null);
});

test('slow dragging requires meaningful travel and scales to taller tablets', () => {
  const short = begin();
  short.update(0, 60, 600);
  assert.equal(short.finish(650), null);
  const phone = begin();
  phone.update(0, 92, 600);
  assert.equal(phone.finish(650), 'search');
  const tablet = begin(1366);
  tablet.update(0, 92, 600);
  assert.equal(tablet.finish(650), null);
  tablet.update(0, 112, 850);
  assert.equal(tablet.finish(900), 'search');
});

test('retracting an armed swipe cancels it instead of opening a panel', () => {
  const gesture = begin();
  gesture.update(0, -150, 300);
  gesture.update(0, -108, 450);
  assert.equal(gesture.finish(470), null);
});

test('retraction remains cancelled after crossing the start or extending again', () => {
  for (const finishY of [40, -150]) {
    const gesture = begin();
    gesture.update(0, -150, 300);
    gesture.update(0, 0, 450);
    gesture.update(0, finishY, 480);
    assert.equal(gesture.finish(490), null);
  }
});

test('release coordinates include the last retraction even without a pointermove sample', () => {
  const gesture = begin();
  gesture.update(0, -100, 300);
  assert.equal(gesture.finish(340, { x: 0, y: -60 }), null);
});

test('a paused short flick does not use stale speed to open a panel', () => {
  const gesture = begin();
  gesture.update(0, 40, 40);
  assert.equal(gesture.finish(350), null);
});

test('axis locks only after directional intent and never switches during a stroke', () => {
  const gesture = begin();
  gesture.update(14, 14, 30);
  assert.equal(gesture.axis, null);
  gesture.update(60, 18, 80);
  assert.equal(gesture.axis, 'x');
  gesture.update(90, 160, 180);
  assert.equal(gesture.axis, 'x');
  assert.equal(gesture.finish(200), 'previous');
});

test('horizontal touch flicks can page without long travel', () => {
  const gesture = begin();
  gesture.update(-42, 3, 60);
  assert.equal(gesture.finish(65), 'next');
});

test('vertical feedback is bounded and returns to zero when retracted', () => {
  const gesture = begin();
  gesture.update(0, -40, 100);
  const first = gesture.offsetY;
  assert.ok(first < 0 && first > -40);
  assert.ok(gesture.progress > 0 && gesture.progress < 1);
  gesture.update(0, -10000, 500);
  assert.ok(gesture.offsetY > -80);
  assert.equal(gesture.progress, 1);
  gesture.update(0, 0, 1000);
  assert.equal(Math.abs(gesture.offsetY), 0);
  assert.equal(gesture.progress, 0);
  assert.equal(gesture.finish(1010), null);
});

test('mouse gestures do not borrow touch flicks or displace the desktop', () => {
  const gesture = begin(844, false);
  gesture.update(0, -24, 30);
  assert.equal(gesture.finish(35), null);
  assert.equal(gesture.offsetY, 0);
  gesture.update(0, -60, 100);
  assert.equal(gesture.finish(105), 'launchpad');
});
