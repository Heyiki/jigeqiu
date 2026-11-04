import assert from 'node:assert/strict';
import test from 'node:test';
import { tipIds, tipMessages } from '../../src/i18n/tips';
import {
  createTipDeck, createTipRotation, formatTip, tipModifier, watchTipEnvironment,
  type TipClock,
} from '../../src/components/desktop/rotating-tips';

function clock() {
  let now = 0;
  let serial = 0;
  const jobs = new Map<number, { at: number; run: () => void }>();
  const timer: TipClock = {
    setTimeout(run, delay) {
      const id = ++serial;
      jobs.set(id, { at: now + delay, run });
      return id;
    },
    clearTimeout(id) { jobs.delete(id); },
  };
  return {
    timer,
    pending: () => jobs.size,
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        const next = [...jobs].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > target) break;
        now = next[1].at;
        jobs.delete(next[0]);
        next[1].run();
      }
      now = target;
    },
  };
}

test('exactly 25 stable bilingual IDs have matching interpolation slots', () => {
  assert.deepEqual(tipIds, Array.from({ length: 25 }, (_, i) => `tip${String(i + 1).padStart(2, '0')}`));
  assert.deepEqual(Object.keys(tipMessages), [...tipIds]);
  for (const id of tipIds) {
    const { zh, en } = tipMessages[id];
    assert.ok(zh.trim() && en.trim(), id);
    const slots = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(slots(zh), slots(en), id);
  }
  for (const command of ['/add', '/all', '/start', '/help', '/dark', '/light']) {
    assert.ok(Object.values(tipMessages).some(value => value.zh.includes(command) && value.en.includes(command)));
  }
  assert.match(tipMessages.tip04.en, /Add bookmark/);
  assert.match(tipMessages.tip23.en, /not.*pin/i);
  assert.match(tipMessages.tip24.en, /JSON/);
  assert.match(tipMessages.tip25.en, /pin.*again/i);
});

test('modifier labels match the guide and interpolate only the selected locale', () => {
  for (const platform of ['MacIntel', 'iPhone', 'iPad']) assert.equal(tipModifier(platform), '⌘');
  for (const platform of ['Win32', 'Linux x86_64', '']) assert.equal(tipModifier(platform), 'Ctrl');
  assert.match(formatTip('tip03', 'en', 'Win32'), /Ctrl\+K/);
  assert.match(formatTip('tip03', 'zh', 'MacIntel'), /⌘\+K/);
  assert.doesNotMatch(formatTip('tip12', 'en', 'MacIntel'), /\{mod\}/);
});

test('shuffled decks are permutations without repeats even across cycle boundaries', () => {
  for (const rng of [() => 0, () => 0.99999, () => 0.5]) {
    const next = createTipDeck(rng);
    let previous: string | undefined;
    for (let cycle = 0; cycle < 10; cycle++) {
      const ids = Array.from({ length: 25 }, () => next());
      assert.equal(new Set(ids).size, 25);
      assert.deepEqual([...ids].sort(), [...tipIds]);
      assert.notEqual(ids[0], previous);
      previous = ids.at(-1);
    }
  }
  assert.notDeepEqual(
    Array.from({ length: 25 }, createTipDeck(() => 0)),
    Array.from({ length: 25 }, createTipDeck(() => 0.99999)),
  );
});

test('seeding the initial displayed ID preserves a complete first deck', () => {
  const next = createTipDeck(() => 0, 'tip12');
  const firstCycle = Array.from({ length: 25 }, () => next());
  assert.equal(firstCycle[0], 'tip12');
  assert.equal(new Set(firstCycle).size, 25);
  assert.notEqual(next(), firstCycle.at(-1));
});

test('rotation holds for 8s, fades out 150ms, changes ID, fades in 150ms, then holds 8s', () => {
  const time = clock();
  const rotation = createTipRotation({ clock: time.timer, rng: () => 0 });
  const initial = rotation.getSnapshot().id;
  time.advance(7999);
  assert.deepEqual(rotation.getSnapshot(), { id: initial, phase: 'visible' });
  time.advance(1);
  assert.deepEqual(rotation.getSnapshot(), { id: initial, phase: 'fadeOut' });
  time.advance(149);
  assert.equal(rotation.getSnapshot().id, initial);
  time.advance(1);
  assert.notEqual(rotation.getSnapshot().id, initial);
  assert.equal(rotation.getSnapshot().phase, 'fadeIn');
  time.advance(150);
  assert.equal(rotation.getSnapshot().phase, 'visible');
  time.advance(7999);
  assert.equal(rotation.getSnapshot().phase, 'visible');
  time.advance(1);
  assert.equal(rotation.getSnapshot().phase, 'fadeOut');
  rotation.destroy();
  assert.equal(time.pending(), 0);
});

test('pause during either fade keeps ID, restores visibility and restarts a full hold', () => {
  for (const delay of [8100, 8200]) {
    const time = clock();
    const rotation = createTipRotation({ clock: time.timer, rng: () => 0 });
    time.advance(delay);
    const id = rotation.getSnapshot().id;
    rotation.configure({ paused: true });
    assert.deepEqual(rotation.getSnapshot(), { id, phase: 'visible' });
    assert.equal(time.pending(), 0);
    time.advance(50000);
    assert.equal(rotation.getSnapshot().id, id);
    rotation.configure({ paused: false });
    time.advance(7999);
    assert.deepEqual(rotation.getSnapshot(), { id, phase: 'visible' });
    time.advance(1);
    assert.equal(rotation.getSnapshot().phase, 'fadeOut');
    rotation.destroy();
  }
});

test('locale resets do not consume the deck and reduced motion cancels both fade phases', () => {
  const time = clock();
  const rotation = createTipRotation({ clock: time.timer, rng: () => 0 });
  const id = rotation.getSnapshot().id;
  time.advance(7500);
  rotation.configure({});
  assert.equal(rotation.getSnapshot().id, id);
  time.advance(7999);
  assert.equal(rotation.getSnapshot().phase, 'visible');
  time.advance(1);
  rotation.configure({ reducedMotion: true });
  assert.deepEqual(rotation.getSnapshot(), { id, phase: 'visible' });
  time.advance(8000);
  const next = rotation.getSnapshot().id;
  assert.notEqual(next, id);
  assert.equal(rotation.getSnapshot().phase, 'visible');
  rotation.configure({ reducedMotion: false });
  time.advance(8150);
  assert.equal(rotation.getSnapshot().phase, 'fadeIn');
  const fadingId = rotation.getSnapshot().id;
  rotation.configure({ reducedMotion: true });
  assert.deepEqual(rotation.getSnapshot(), { id: fadingId, phase: 'visible' });
  rotation.destroy();
});

test('initial pause/reduced motion, subscriptions and disposal leave no timers or notifications', () => {
  const time = clock();
  const rotation = createTipRotation({ clock: time.timer, paused: true, reducedMotion: true });
  assert.equal(time.pending(), 0);
  let notifications = 0;
  const unsubscribe = rotation.subscribe(() => notifications++);
  rotation.configure({ paused: false });
  time.advance(8000);
  assert.equal(notifications, 1);
  unsubscribe();
  time.advance(8000);
  assert.equal(notifications, 1);
  rotation.destroy();
  rotation.configure({ paused: false });
  time.advance(100000);
  assert.equal(notifications, 1);
  assert.equal(time.pending(), 0);
});

test('environment reports initial visibility/motion, reacts to changes and removes listeners', () => {
  const doc = Object.assign(new EventTarget(), { hidden: true });
  const media = Object.assign(new EventTarget(), { matches: false });
  const seen: Array<{ hidden: boolean; reducedMotion: boolean }> = [];
  const stop = watchTipEnvironment(doc, media, state => seen.push(state));
  assert.deepEqual(seen, [{ hidden: true, reducedMotion: false }]);
  doc.hidden = false;
  doc.dispatchEvent(new Event('visibilitychange'));
  media.matches = true;
  media.dispatchEvent(new Event('change'));
  assert.deepEqual(seen.at(-1), { hidden: false, reducedMotion: true });
  assert.equal(seen.length, 3);
  stop();
  doc.dispatchEvent(new Event('visibilitychange'));
  media.dispatchEvent(new Event('change'));
  assert.equal(seen.length, 3);
});

test('hidden documents pause the real scheduler and becoming visible restarts the full hold', () => {
  const time = clock();
  const rotation = createTipRotation({ clock: time.timer });
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const media = Object.assign(new EventTarget(), { matches: false });
  const stop = watchTipEnvironment(doc, media, ({ hidden, reducedMotion }) => {
    rotation.configure({ paused: hidden, reducedMotion });
  });
  time.advance(8050);
  const id = rotation.getSnapshot().id;
  doc.hidden = true;
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(rotation.getSnapshot(), { id, phase: 'visible' });
  assert.equal(time.pending(), 0);
  time.advance(20000);
  doc.hidden = false;
  doc.dispatchEvent(new Event('visibilitychange'));
  time.advance(7999);
  assert.deepEqual(rotation.getSnapshot(), { id, phase: 'visible' });
  time.advance(1);
  assert.equal(rotation.getSnapshot().phase, 'fadeOut');
  stop();
  rotation.destroy();
  assert.equal(time.pending(), 0);
});
