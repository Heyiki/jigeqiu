import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { transformSync } from 'esbuild';

const root = new URL('../../', import.meta.url);
const sourcePath = new URL('src/components/onboarding/Tour.tsx', root);
const messagesPath = new URL('src/i18n/onboarding.ts', root);
const source = () => readFileSync(sourcePath, 'utf8');

function load(file: URL) {
  const require = createRequire(file);
  const module = { exports: {} as Record<string, any> };
  const code = transformSync(readFileSync(file, 'utf8'), {
    loader: 'tsx', format: 'cjs', jsx: 'automatic',
  }).code;
  new Function('require', 'module', 'exports', code)(
    (id: string) => id.endsWith('.css') ? {} : require(id), module, module.exports,
  );
  return module.exports;
}

test('onboarding provides an independently importable bilingual catalog', () => {
  assert.ok(existsSync(messagesPath), 'onboarding catalog must exist');
  const { onboardingMessages: messages } = load(messagesPath);
  const required = [
    'WelcomeTitle', 'WelcomeBody', 'Start', 'Skip', 'Next', 'Prev', 'Done',
    'ChooseTask', 'ImportTask', 'AddTask', 'PinTask', 'Later', 'TourUnavailable',
    'ProgressSaveFailed', 'ImportDone', 'AddDone', 'PinDone', 'BackupTitle',
    'BackupDescription', 'GuideStart', 'GuideImport', 'GuideAdd', 'GuidePin',
    'NoBookmarks', 'AddUrl', 'AddDetails', 'ImportFile', 'ImportPreview',
    'PinSearch', 'PinChoose', 'PinAction', 'ViewShortcut', 'Exit',
  ];
  for (const suffix of required) assert.ok(messages[`onboarding${suffix}`], suffix);
  for (const [key, value] of Object.entries(messages) as [string, { zh: string; en: string }][]) {
    assert.ok(key.startsWith('onboarding'), key);
    assert.ok(value.zh.trim() && value.en.trim(), key);
    const slots = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(slots(value.zh), slots(value.en), key);
  }
  assert.equal(messages.onboardingAddUrl.zh, '填入你想收藏的网址。');
  assert.equal(messages.onboardingAddDetails.zh, '确认名称和保存位置；关键词可选，用熟悉的叫法帮助以后找回。');
  assert.equal(messages.onboardingViewShortcut.zh, '查看桌面快捷方式');
  assert.equal(messages.onboardingExit.zh, '退出引导');
  assert.deepEqual(messages.onboardingOpenSearch, { zh: '打开搜索', en: 'Open search' });
  assert.deepEqual(messages.onboardingSearchPlaceholder, {
    zh: '搜索收藏或输入网址', en: 'Search bookmarks or enter a URL',
  });
  assert.deepEqual(messages.onboardingBackupTitle, {
    zh: '导出JSON资产备份', en: 'Export JSON asset backup',
  });
  for (const exclusion of ['设置', '桌面', '任务栏', '壁纸', '回收站']) {
    assert.ok(messages.onboardingBackupDescription.zh.includes(exclusion), exclusion);
  }
  assert.match(messages.onboardingPinDone.zh, /移除.*快捷方式.*不会删除.*收藏/);
  assert.match(messages.onboardingPinDone.en, /Removing.*shortcut.*does not delete.*bookmark/);
  assert.match(readFileSync(messagesPath, 'utf8'), /import type \{ MessageTable \}/);
  assert.match(readFileSync(messagesPath, 'utf8'), /satisfies MessageTable/);
});

test('tour has exactly five localized steps and a centered hidden-launchpad fallback', () => {
  assert.ok(existsSync(sourcePath), 'Tour component must exist');
  const { buildOnboardingSteps } = load(sourcePath);
  const anchors = Object.fromEntries(['desktop', 'search', 'management', 'guide'].map(key => [key, {}]));
  const zh = buildOnboardingSteps('zh-CN', anchors);
  const en = buildOnboardingSteps('en-US', anchors);
  assert.equal(zh.length, 5);
  assert.equal(en.length, 5);
  assert.deepEqual(zh.map((step: any) => step.element), [
    anchors.desktop, anchors.search, undefined, anchors.management, anchors.guide,
  ]);
  assert.match(en[2].popover.description, /\/start/);
  for (let i = 0; i < 5; i++) {
    assert.notEqual(zh[i].popover.title, en[i].popover.title);
    assert.notEqual(zh[i].popover.description, en[i].popover.description);
  }
  const launchpad = {};
  const visible = buildOnboardingSteps('en', { ...anchors, launchpad });
  assert.equal(visible[2].element, launchpad);
});

test('tour lazily loads Driver with noninteractive targets and explicit keyboard ownership', () => {
  const code = source();
  assert.match(code, /import\('driver\.js'\)/);
  assert.match(code, /import 'driver\.js\/dist\/driver\.css'/);
  assert.match(code, /disableActiveInteraction: true/);
  assert.match(code, /overlayClickBehavior: 'none'/);
  assert.match(code, /allowKeyboardControl: false/);
  assert.match(code, /showProgress: true/);
  assert.match(code, /showButtons: \['next', 'previous', 'close'\]/);
  assert.match(code, /event\.key === 'Escape'/);
  assert.match(code, /event\.key === 'Tab'/);
  assert.match(code, /addEventListener\('focusin'/);
  assert.match(code, /removeEventListener\('focusin'/);
  assert.match(code, /preventScroll: true/);
});

test('anchor waiting is bounded, visibility-aware and abortable', () => {
  const code = source();
  assert.match(code, /MutationObserver/);
  assert.match(code, /3_000/);
  assert.match(code, /signal\.aborted/);
  assert.match(code, /disconnect\(\)/);
  assert.match(code, /clearTimeout/);
  assert.match(code, /getComputedStyle/);
  assert.match(code, /getBoundingClientRect/);
  for (const anchor of ['desktop', 'search', 'management', 'guide']) {
    assert.ok(code.includes(`'${anchor}'`));
  }
});

test('locale replacement retains the step while teardown suppresses callbacks', () => {
  const code = source();
  assert.match(code, /getActiveIndex\(\)/);
  assert.match(code, /drive\(stepIndex\.current\)/);
  assert.match(code, /controller\.abort\(\)/);
  assert.match(code, /disposed = true/);
  assert.match(code, /onDestroyed:/);
  assert.match(code, /reason === 'done'/);
  assert.match(code, /settled\.current/);
  assert.match(code, /onUnavailable/);
});

test('tour styling is scoped, narrow-screen safe and supports dark and reduced motion', () => {
  const css = readFileSync(new URL('src/components/onboarding/onboarding.css', root), 'utf8');
  assert.match(css, /\.onboarding-tour/);
  assert.match(css, /320px/);
  assert.match(css, /100vw/);
  assert.match(css, /dark-glass/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /letter-spacing: 0/);
  assert.doesNotMatch(css, /letter-spacing:\s*-/);
});

test('anchor observer resolves only visible required anchors and disconnects on success or abort', async () => {
  const { waitForOnboardingAnchors } = load(sourcePath);
  const originals = Object.getOwnPropertyDescriptors(globalThis);
  const anchors = new Map<string, any[]>();
  let notify = () => {};
  let disconnected = 0;
  let cleared = 0;
  let timeout = () => {};
  function anchor(visible = true) {
    return {
      isConnected: true, parentElement: null, visible,
      closest: () => null,
      getBoundingClientRect: () => ({
        width: visible ? 30 : 0, height: visible ? 30 : 0,
        top: 10, left: 10, right: 40, bottom: 40,
      }),
    };
  }
  const globals = {
    document: {
      documentElement: {},
      querySelectorAll: (selector: string) => anchors.get(selector.match(/"([^"]+)"/)![1]) ?? [],
    },
    window: {
      innerHeight: 600, innerWidth: 320,
      setTimeout: (callback: () => void, ms: number) => { assert.equal(ms, 3000); timeout = callback; return 1; },
      clearTimeout: () => { cleared++; },
      addEventListener() {}, removeEventListener() {},
    },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    MutationObserver: class {
      constructor(callback: () => void) { notify = callback; }
      observe() {}
      disconnect() { disconnected++; }
    },
  };
  try {
    for (const [key, value] of Object.entries(globals)) {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    anchors.set('desktop', [anchor()]);
    anchors.set('search', [anchor()]);
    anchors.set('management', [anchor()]);
    anchors.set('guide', [anchor(false)]);
    let resolved = false;
    const promise = waitForOnboardingAnchors(new AbortController().signal).then((value: any) => {
      resolved = true;
      return value;
    });
    await Promise.resolve();
    assert.equal(resolved, false, 'a hidden guide must not start the tour');
    const guide = anchor();
    anchors.get('guide')!.push(guide);
    notify();
    const result = await promise;
    assert.equal(result.guide, guide, 'a visible duplicate is preferred to a hidden anchor');
    assert.equal(result.launchpad, undefined);
    assert.equal(disconnected, 1);
    assert.equal(cleared, 1);

    anchors.delete('guide');
    const controller = new AbortController();
    const cancelled = waitForOnboardingAnchors(controller.signal);
    controller.abort();
    assert.equal(await cancelled, null);
    notify();
    assert.equal(disconnected, 2);
    assert.equal(cleared, 2);

    const expired = waitForOnboardingAnchors(new AbortController().signal);
    timeout();
    assert.equal(await expired, null);
    assert.equal(disconnected, 3);

    const aborted = new AbortController();
    aborted.abort();
    assert.equal(await waitForOnboardingAnchors(aborted.signal), null);
    assert.equal(disconnected, 3, 'already-aborted waits never install an observer');
  } finally {
    for (const key of Object.keys(globals)) {
      if (originals[key]) Object.defineProperty(globalThis, key, originals[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
