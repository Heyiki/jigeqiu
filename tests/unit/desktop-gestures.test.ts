import assert from 'node:assert/strict';
import test from 'node:test';
import { createWheelGesture, rubberBand, WHEEL_GESTURE_IDLE_MS } from '../../src/components/desktop/desktop-gestures';

test('one continuous wheel gesture only commits one page, including momentum after cooldown', () => {
  const gesture = createWheelGesture();
  assert.equal(gesture.update(12, 1, 0).step, 0);
  assert.equal(gesture.update(40, 2, 20).step, 1);
  for (let now = 40; now < 1000; now += 40) {
    assert.equal(gesture.update(30, 1, now).step, 0);
  }
  assert.equal(gesture.update(-60, 0, 1300).step, -1);
});

test('small jitter, opposite drift and vertical movement do not accidentally turn a page', () => {
  const gesture = createWheelGesture();
  assert.equal(gesture.update(3, 1, 0).step, 0);
  assert.equal(gesture.update(-3, 1, 10).step, 0);
  assert.equal(gesture.update(1, 20, 20).step, 0);
  assert.equal(gesture.update(60, 1, 30).step, 0, 'Axis remains locked until gesture ends');
  assert.equal(gesture.update(0, 70, 400).step, 1, 'Regular mouse wheel can turn a desktop page');
});

test('a short quiet gap accepts consecutive full swipes without losing small event accumulation', () => {
  const gesture = createWheelGesture();
  assert.equal(WHEEL_GESTURE_IDLE_MS, 50);
  assert.equal(gesture.update(60, 0, 0).step, 1);
  assert.equal(gesture.update(60, 0, 50).step, 1);
  assert.equal(gesture.update(60, 0, 100).step, 1);
});

test('three renewed swipes work while the previous momentum is still moderately strong', () => {
  const gesture = createWheelGesture();
  const steps = [60, 45, 32, 24, 30, 42, 50, 38, 26, 18, 24, 34, 48]
    .map((dx, index) => gesture.update(dx, 0, index * 16).step);
  assert.deepEqual(steps, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
});

test('small renewed impulses accumulate across events without a minimum time since the last page', () => {
  const gesture = createWheelGesture();
  const steps = [8, 18, 26, 20, 12, 6, 10, 18, 22, 16, 10, 4, 8, 16, 24]
    .map((dx, index) => gesture.update(dx, 0, index * 12).step);
  assert.deepEqual(steps, [0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
});

test('decay is measured from the actual crest even when it occurs after the page commits', () => {
  const gesture = createWheelGesture();
  const steps = [8, 18, 26, 44, 60, 48, 34, 26, 34, 44]
    .map((dx, index) => gesture.update(dx, 0, index * 16).step);
  assert.deepEqual(steps, [0, 0, 1, 0, 0, 0, 0, 0, 0, 1]);
});

for (const direction of [-1, 1]) {
  test(`gradual renewed effort retains the decayed state in direction ${direction}`, () => {
    const gesture = createWheelGesture();
    const steps = [60, 40, 24, 12, 13, 15, 18, 24, 32, 40, 30, 20, 10, 11, 13, 16, 21, 28, 34]
      .map((dx, index) => gesture.update(dx * direction, 0, index * 16).step);
    assert.deepEqual(steps.map((step, index) => step ? index : -1).filter(index => index >= 0), [0, 7, 16]);
    assert.equal(steps.reduce((sum, step) => sum + step, 0), direction * 3);
  });

  test(`flat samples do not disarm gradual renewed effort in direction ${direction}`, () => {
    const gesture = createWheelGesture();
    const steps = [60, 40, 24, 12, 12, 12, 13, 13, 14, 15, 18]
      .map((dx, index) => gesture.update(dx * direction, 0, index * 16).step);
    assert.deepEqual(steps, [direction, 0, 0, 0, 0, 0, 0, 0, 0, direction, 0]);
  });
}

test('small fluctuations after decay never turn another page by accumulating inertia', () => {
  const gesture = createWheelGesture();
  const steps = [60, 40, 24, 12, ...Array.from({ length: 30 }, (_, index) => index % 2 ? 12 : 13)]
    .map((dx, index) => gesture.update(dx, 0, index * 16).step);
  assert.equal(steps.reduce((sum, step) => sum + step, 0), 1);
});

test('a flat sample between declining samples does not erase evidence of decay', () => {
  const gesture = createWheelGesture();
  const steps = [60, 40, 24, 24, 12, 13, 15, 18, 24]
    .map((dx, index) => gesture.update(dx, 0, index * 16).step);
  assert.deepEqual(steps, [1, 0, 0, 0, 0, 0, 0, 0, 1]);
});

test('expired candidate displacement is not carried into a later renewed swipe', () => {
  const gesture = createWheelGesture();
  const steps = [[0, 60], [16, 40], [32, 24], [48, 12], [64, 13], [96, 13],
    [132, 15], [148, 16], [164, 17]]
    .map(([at, dx]) => gesture.update(dx, 0, at).step);
  assert.deepEqual(steps, [1, 0, 0, 0, 0, 0, 0, 0, 1]);
});

test('a deliberate reverse swipe responds immediately without unlocking on opposite jitter', () => {
  const gesture = createWheelGesture();
  assert.equal(gesture.update(60, 0, 0).step, 1);
  assert.equal(gesture.update(-3, 0, 16).step, 0);
  assert.equal(gesture.update(25, 0, 32).step, 0);
  assert.equal(gesture.update(-60, 0, 48).step, -1);
  assert.equal(gesture.update(-30, 0, 64).step, 0);
  assert.equal(gesture.update(60, 0, 80).step, 1);
});

test('same-direction renewed effort after decaying inertia starts a new page before silence', () => {
  const gesture = createWheelGesture();
  assert.equal(gesture.update(60, 0, 0).step, 1);
  for (const [now, dx] of [[20, 35], [40, 15], [60, 8], [80, 5]]) {
    assert.equal(gesture.update(dx, 0, now).step, 0);
  }
  assert.equal(gesture.update(20, 0, 100).step, 0, 'Wait for a sustained new impulse');
  assert.equal(gesture.update(32, 0, 116).step, 1);
  for (const [now, dx] of [[132, 35], [148, 20], [164, 8], [180, 3]]) {
    assert.equal(gesture.update(dx, 0, now).step, 0, 'The renewed swipe also commits only once');
  }
});

test('slow small momentum and an isolated spike never become another page', () => {
  const gesture = createWheelGesture();
  assert.equal(gesture.update(60, 0, 0).step, 1);
  for (const [now, dx] of [[20, 30], [40, 10], [60, 6], [80, 3], [100, 55], [116, 4],
    [216, 3], [316, 2], [416, 1]]) {
    assert.equal(gesture.update(dx, 0, now).step, 0, `Ignore momentum at ${now}ms`);
  }
  assert.equal(gesture.update(60, 0, 520).step, 1);
});

test('sustained acceleration within the initial swipe still turns only one page', () => {
  const gesture = createWheelGesture();
  let steps = 0;
  for (const [index, dx] of [5, 12, 30, 55, 80, 100, 90, 70, 40, 20, 8, 4].entries()) {
    steps += Math.abs(gesture.update(dx, 0, index * 16).step);
  }
  assert.equal(steps, 1);
});

test('edge rubber band has progressive resistance, stable sign and a bounded maximum', () => {
  assert.equal(rubberBand(0, 1000), 0);
  assert.ok(rubberBand(100, 1000) > rubberBand(50, 1000));
  assert.ok(rubberBand(100, 1000) - rubberBand(50, 1000) < rubberBand(50, 1000));
  assert.ok(rubberBand(10000, 1000) < 100);
  assert.equal(rubberBand(-100, 1000), -rubberBand(100, 1000));
  assert.ok(Number.isFinite(rubberBand(100, 0)));
});
