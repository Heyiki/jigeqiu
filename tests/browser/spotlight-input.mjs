import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const extension = path.join(root, 'dist-extension');
const profile = await mkdtemp(path.join(os.tmpdir(), 'jigeqiu-search-input-'));
const privacySource = await readFile(path.join(root, 'extension/privacy/content.ts'), 'utf8');
const version = privacySource.match(/PRIVACY_VERSION = '([^']+)'/)[1];
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  await context.route(/^https?:/, route => route.fulfill({ body: 'Synthetic destination' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('chrome://newtab/');
  await page.getByRole('heading', { name: '使用前的隐私告知', exact: true }).waitFor();
  await page.evaluate(async version => {
    const bookmarks = Array.from({ length: 1200 }, (_, index) => ({
      id: `input-${index}`, title: `Alpha sample ${index}`, url: `https://site${index}.example.test/`,
      domain: `site${index}.example.test`, iconMode: 'text', keywords: [], notes: '', tags: [],
      collectionIds: [], order: index, pinnedToDesktop: false, createdAt: 1, updatedAt: 1,
    }));
    const key = 'jigeqiu-extension-state-v1';
    const state = (await globalThis.chrome.storage.local.get(key))[key];
    state.revision++;
    Object.assign(state.data, {
      'jigeqiu-extension-privacy-acknowledged': version,
      jipage_bookmarks_v1: JSON.stringify(bookmarks),
      jipage_folders_v1: '[]',
      jipage_settings_v1: JSON.stringify({ language: 'zh', appearanceMode: 'light-glass' }),
    });
    await globalThis.chrome.storage.local.set({ [key]: state });
  }, version);
  await page.reload();
  const open = () => page.getByRole('button', { name: /^(打开搜索|Open search)$/ }).click();
  await open();
  const dialog = page.locator('[data-panel="search"]');
  const input = dialog.getByRole('combobox');
  const baseline = await page.evaluate(async () =>
    (await globalThis.chrome.storage.local.get('jigeqiu-extension-state-v1'))['jigeqiu-extension-state-v1'].data);
  await input.evaluate(element => {
    window.inputPaints = [];
    element.addEventListener('keydown', event => {
      if (event.key.length !== 1 && event.key !== 'Backspace') return;
      const start = performance.now();
      requestAnimationFrame(() => window.inputPaints.push({
        key: event.key, value: element.value, elapsed: performance.now() - start,
      }));
    }, true);
  });
  await input.press('a');
  await dialog.locator('#spotlight-result-bm-input-0').waitFor();
  const paints = await page.evaluate(() => window.inputPaints);
  console.log('FIRST INPUT', JSON.stringify(paints));
  assert.equal(paints[0].value, 'a', 'First character is reflected at the next paint');
  assert.ok(await dialog.getByRole('option').count() <= 40,
    'A broad first character must not mount the entire matching library');
  // No wall-clock pass/fail threshold: report local timing and test the work bound instead.
  await input.pressSequentially('lpha');
  assert.equal(await input.inputValue(), 'alpha');
  await dialog.locator('#spotlight-result-action-search-engine').getByText('使用 Google 搜索 “alpha”', { exact: true }).waitFor();
  const list = dialog.getByRole('listbox');
  await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await dialog.locator('#spotlight-result-bm-input-1199').waitFor();
  await input.fill('alpha');
  await input.press('ArrowUp');
  await page.waitForFunction(() => document.querySelector('[role="combobox"]').getAttribute('aria-activedescendant')
    === 'spotlight-result-bm-input-1199');
  await input.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'spotlight-result-action-search-engine');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await input.evaluate(element => element === document.activeElement), true);
  await input.fill('a');
  await dialog.locator('#spotlight-result-bm-input-0').waitFor();
  const opened = context.waitForEvent('page');
  // Input and submit in one task: a pending render must not execute an old bookmark/command.
  await input.evaluate(element => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, '/g fresh query');
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.form.requestSubmit();
  });
  const popup = await opened;
  await popup.waitForLoadState();
  assert.equal(new URL(popup.url()).searchParams.get('q'), 'fresh query');
  await popup.close();
  await open();
  await input.fill('中文输入');
  await input.dispatchEvent('compositionstart');
  await input.dispatchEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true });
  assert.equal(await dialog.isVisible(), true);
  assert.equal(context.pages().filter(page => page.url().startsWith('https:')).length, 0);
  await input.dispatchEvent('compositionend');
  await input.press('Escape');
  const after = await page.evaluate(async () =>
    (await globalThis.chrome.storage.local.get('jigeqiu-extension-state-v1'))['jigeqiu-extension-state-v1'].data);
  for (const key of ['jipage_library_v2', 'jipage_bookmarks_v1', 'jipage_folders_v1']) {
    assert.equal(after[key], baseline[key], 'Searching cannot change bookmark assets');
  }
  assert.deepEqual(errors, []);
  console.log('PASS extension input paint, bounded full-library results, scroll/keyboard reachability, fresh submit and IME');
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
