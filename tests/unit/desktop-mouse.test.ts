import assert from 'node:assert/strict';
import test from 'node:test';
import { createDesktopGesture } from '../../src/components/desktop/desktop-gestures';

function begin() {
  return createDesktopGesture({ x: 0, y: 0, now: 0, width: 1440, height: 900, touch: false });
}

test('a deliberate short mouse drag opens either vertical panel with slight sideways travel', () => {
  for (const direction of [-1, 1]) {
    const gesture = begin();
    gesture.update(4, 20 * direction, 120);
    assert.ok(gesture.progress > 0 && gesture.progress < 1);
    gesture.update(8, 36 * direction, 300);
    assert.equal(gesture.progress, 1);
    assert.equal(gesture.finish(320), direction < 0 ? 'launchpad' : 'search');
    assert.equal(gesture.offsetY, 0, 'Mouse preview must not move desktop icons');
  }
});

test('early sideways mouse jitter can be corrected before paging intent is established', () => {
  for (const direction of [-1, 1]) {
    const gesture = begin();
    gesture.update(12, 2, 16);
    gesture.update(15, 40 * direction, 160);
    assert.equal(gesture.axis, 'y');
    assert.equal(gesture.finish(180), direction < 0 ? 'launchpad' : 'search');
  }
});

test('a provisional vertical mouse movement can still become horizontal paging', () => {
  const gesture = begin();
  gesture.update(2, 12, 16);
  gesture.update(-125, 15, 200);
  assert.equal(gesture.axis, 'x');
  assert.equal(gesture.progress, 0);
  assert.equal(gesture.finish(220), 'next');
});

test('deliberate horizontal paging cannot be converted into opening a vertical panel', () => {
  const gesture = begin();
  gesture.update(-60, 3, 100);
  gesture.update(-125, 50, 200);
  assert.equal(gesture.finish(220), 'next');
  const curved = begin();
  curved.update(-60, 3, 100);
  curved.update(-65, 120, 250);
  assert.equal(curved.finish(270), null);
});

test('small mouse movements, subthreshold flicks and diagonal strokes do not open panels', () => {
  for (const [x, y, time] of [[2, 5, 100], [0, -28, 20], [0, 35, 400], [40, 40, 200]]) {
    const gesture = begin();
    gesture.update(x, y, time);
    assert.equal(gesture.finish(time + 10), null);
  }
});

test('retracting an armed vertical mouse gesture cancels until the next press', () => {
  for (const direction of [-1, 1]) {
    for (const finalY of [40 * direction, -40 * direction, 90 * direction]) {
      const gesture = begin();
      gesture.update(0, 60 * direction, 100);
      gesture.update(0, 40 * direction, 200);
      assert.equal(gesture.progress, 0);
      gesture.update(0, finalY, 250);
      assert.equal(gesture.finish(270), null);
    }
  }
});

test('release-only mouse retraction cancels but small release jitter remains tolerated', () => {
  const retracted = begin();
  retracted.update(0, -60, 100);
  assert.equal(retracted.finish(180, { x: 0, y: -40 }), null);
  const jitter = begin();
  jitter.update(0, -42, 100);
  assert.equal(jitter.finish(180, { x: 2, y: -38 }), 'launchpad');
});

test('vertical mouse preview disarms when sideways drift makes release ineligible', () => {
  for (const direction of [-1, 1]) {
    const gesture = begin();
    gesture.update(0, 40 * direction, 100);
    assert.equal(gesture.progress, 1);
    gesture.update(60, 45 * direction, 200);
    assert.equal(gesture.axis, 'y', 'An established gesture cannot change its action axis');
    assert.equal(gesture.progress, 0, 'Do not promise a panel when a diagonal release will be ignored');
    assert.equal(gesture.finish(220), null);
  }
});

test('short horizontal mouse drags page at the same distance on narrow and wide desktops', () => {
  for (const width of [320, 1024, 1440, 2560]) {
    for (const direction of [-1, 1]) {
      const gesture = createDesktopGesture({ x: 0, y: 0, now: 0, width, height: 900, touch: false });
      gesture.update(28 * direction, 4, 500);
      assert.equal(gesture.finish(520), direction < 0 ? 'next' : 'previous');
      assert.equal(gesture.progress, 0, 'Horizontal paging never shows the vertical panel hint');
    }
  }
});

test('tiny mouse flicks and slow subthreshold drags do not page', () => {
  for (const direction of [-1, 1]) {
    for (const [distance, at] of [[5, 20], [15, 20], [24, 500], [27, 500]]) {
      const gesture = begin();
      gesture.update(distance * direction, 2, at);
      assert.equal(gesture.finish(at + 5), null);
    }
    const diagonal = begin();
    diagonal.update(36 * direction, 34, 300);
    assert.equal(diagonal.finish(320), null);
  }
});

test('short mouse flicks use recent same-direction release speed in either direction', () => {
  for (const direction of [-1, 1]) {
    const gesture = begin();
    gesture.update(8 * direction, 1, 20);
    gesture.update(16 * direction, 2, 40);
    assert.equal(gesture.finish(45, { x: 18 * direction, y: 2 }), direction < 0 ? 'next' : 'previous');
    const late = begin();
    late.update(2 * direction, 0, 500);
    late.update(10 * direction, 1, 530);
    late.update(22 * direction, 2, 560);
    assert.equal(late.finish(565), direction < 0 ? 'next' : 'previous', 'A slow start does not dilute the release speed');
  }
});

test('pausing or moving sideways before releasing a short mouse drag must not page', () => {
  for (const direction of [-1, 1]) {
    for (const releaseTime of [140, 400]) {
      const gesture = begin();
      gesture.update(20 * direction, 0, 40);
      gesture.update(20 * direction, 1, releaseTime - 5);
      assert.equal(gesture.finish(releaseTime, { x: 20 * direction, y: 2 }), null);
    }
    const sideways = begin();
    sideways.update(20 * direction, 0, 40);
    sideways.update(20 * direction, 22, 55);
    assert.equal(sideways.finish(60), null);
    const reversed = begin();
    reversed.update(24 * direction, 0, 40);
    reversed.update(20 * direction, 0, 50);
    assert.equal(reversed.finish(55), null, 'The release motion must agree with the drag direction');
  }
});

test('early horizontal hand correction remains recoverable and release-only movement counts', () => {
  for (const direction of [-1, 1]) {
    const retracted = begin();
    retracted.update(24 * direction, 0, 40);
    retracted.update(10 * direction, 0, 60);
    retracted.update(22 * direction, 0, 75);
    assert.equal(retracted.finish(80), direction < 0 ? 'next' : 'previous');
    const release = begin();
    release.update(8 * direction, 0, 20);
    assert.equal(release.finish(40, { x: 18 * direction, y: 1 }), direction < 0 ? 'next' : 'previous');
  }
});

test('retracting an armed horizontal mouse drag cancels even when extended again or reversed', () => {
  for (const direction of [-1, 1]) {
    const short = begin();
    short.update(36 * direction, 2, 300);
    short.update(24 * direction, 3, 400);
    short.update(60 * direction, 3, 500);
    assert.equal(short.finish(520), null);
    for (const finalX of [60 * direction, 130 * direction, -80 * direction]) {
      const gesture = begin();
      gesture.update(100 * direction, 2, 300);
      gesture.update(60 * direction, 3, 400);
      gesture.update(finalX, 3, 500);
      assert.equal(gesture.finish(520), null);
    }
  }
});

test('horizontal startup correction is as forgiving as the search gesture', () => {
  for (const direction of [-1, 1]) {
    const horizontal = begin();
    const vertical = begin();
    for (const [distance, at] of [[20, 20], [8, 40], [45, 100]]) {
      horizontal.update(distance * direction, 2, at);
      vertical.update(2, distance * direction, at);
    }
    assert.equal(horizontal.finish(105), direction < 0 ? 'next' : 'previous');
    assert.equal(vertical.finish(105), direction < 0 ? 'launchpad' : 'search');
  }
});

test('short flicks tolerate tiny release reversal but reject deliberate reverse motion', () => {
  for (const direction of [-1, 1]) {
    const jitter = begin();
    jitter.update(10 * direction, 0, 20);
    jitter.update(22 * direction, 0, 45);
    assert.equal(jitter.finish(50, { x: 21 * direction, y: 1 }), direction < 0 ? 'next' : 'previous');
    const reversal = begin();
    reversal.update(24 * direction, 0, 40);
    assert.equal(reversal.finish(55, { x: 18 * direction, y: 1 }), null);
  }
});

test('horizontal mouse release coordinates cancel retraction but tolerate small hand jitter', () => {
  for (const direction of [-1, 1]) {
    const retracted = begin();
    retracted.update(80 * direction, 0, 200);
    assert.equal(retracted.finish(250, { x: 55 * direction, y: 2 }), null);
    const jitter = begin();
    jitter.update(42 * direction, 0, 200);
    assert.equal(jitter.finish(250, { x: 38 * direction, y: 2 }), direction < 0 ? 'next' : 'previous');
  }
});
