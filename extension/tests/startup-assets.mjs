import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const extension = path.resolve('dist-extension');
const profile = await mkdtemp(path.join(tmpdir(), 'jigeqiu-startup-assets-'));
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, locale: 'zh-CN',
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1440, height: 1000 },
  });
  await context.route(/^https?:/, route => route.abort());
  const setup = await context.newPage();
  await setup.goto('chrome://newtab/');
  await setup.getByRole('heading', { name: '使用前的隐私告知', exact: true }).waitFor();
  const privacyVersion = (await setup.locator('.privacy-version').innerText()).match(/\d{4}-\d{2}-\d{2}\.\d+/)[0];
  await setup.evaluate(async privacyVersion => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const drawing = canvas.getContext('2d');
    drawing.fillStyle = '#247e68'; drawing.fillRect(0, 0, 128, 128);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const write = async (name, version, stores, put) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(name, version);
        request.onupgradeneeded = () => stores.forEach(([store, options]) => {
          if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, options);
        });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(stores.map(([store]) => store), 'readwrite');
          put(tx);
          tx.oncomplete = resolve;
          tx.onabort = () => reject(tx.error);
        });
      } finally { db.close(); }
    };
    await write('jigeqiu-wallpapers-v1', 2, [['images'], ['metadata']], tx => {
      tx.objectStore('images').put(blob, 'startup-wallpaper');
    });
    await write('jigeqiu-site-icons-v1', 1, [['icons', { keyPath: 'key' }]], tx => {
      tx.objectStore('icons').put({
        key: JSON.stringify([false, ['https://startup.invalid/favicon.ico'], null]),
        source: 'https://startup.invalid/favicon.ico', blob, updatedAt: Date.now(), accessedAt: Date.now(),
      });
    });
    await chrome.storage.local.set({ 'jigeqiu-extension-state-v1': {
      version: 1, revision: 1, data: {
        'jigeqiu-extension-privacy-acknowledged': privacyVersion,
        jipage_library_v2: JSON.stringify({
          version: 1, bookmarks: [{
            id: 'startup-icon', title: 'Startup cached icon', url: 'https://startup.invalid/', domain: 'startup.invalid',
            category: 'uncategorized', keywords: [], order: 0, collectionIds: [], createdAt: 1, updatedAt: 1,
          }], folders: [], collections: [], bookmarkTrash: [], folderTrash: [], dockBookmarkIds: [],
          desktopLayout: { shortcuts: [{ id: 'startup-shortcut', bookmarkId: 'startup-icon' }],
            folders: [], root: [{ kind: 'shortcut', id: 'startup-shortcut' }], dock: [] },
        }),
        jipage_settings_v1: JSON.stringify({ language: 'zh', wallpaperPreset: 'custom', customWallpaperId: 'startup-wallpaper' }),
      },
    } });
  }, privacyVersion);
  await setup.close();
  await context.addInitScript(() => {
    const original = HTMLImageElement.prototype.decode;
    const gates = {
      icon: new Promise(resolve => { globalThis.resumeStartupIcon = resolve; }),
      wallpaper: new Promise(resolve => { globalThis.resumeStartupWallpaper = resolve; }),
    };
    globalThis.assetFrames = [];
    HTMLImageElement.prototype.decode = async function () {
      await original.call(this);
      if (!this.src.startsWith('blob:')) return;
      const kind = this.classList.contains('site-icon-image') ? 'icon' : 'wallpaper';
      globalThis[`${kind}Pending`] = true;
      await gates[kind];
    };
    const sample = () => {
      const canvas = document.querySelector('[data-wallpaper-canvas]');
      if (canvas) globalThis.assetFrames.push({
        image: getComputedStyle(canvas).backgroundImage,
        textIcons: document.querySelectorAll('[aria-label="Startup cached icon"] [data-fallback-kind]').length,
      });
      if (globalThis.assetFrames.length < 600) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const remote = [];
  context.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const mode of ['newtab', 'reload']) {
    if (mode === 'newtab') await page.goto('chrome://newtab/');
    else await page.reload();
    await page.waitForFunction(() => globalThis.iconPending && globalThis.wallpaperPending);
    await page.locator('[data-testid="desktop-viewport"]').waitFor();
    assert.equal(await page.locator('[data-wallpaper-canvas]').evaluate(el => getComputedStyle(el).backgroundImage), 'none');
    const icon = page.locator('[data-testid="desktop-viewport"] [data-site-icon][aria-label="Startup cached icon"]');
    assert.equal(await icon.getAttribute('data-icon-state'), 'loading');
    assert.equal(await icon.locator('[data-fallback-kind]').count(), 0);
    await page.locator('[data-onboarding="launchpad"]').click();
    await page.locator('[data-panel="launchpad"]').waitFor();
    await page.keyboard.press('Escape');
    // Icons can become ready while the wallpaper remains slow, and vice versa.
    await page.evaluate(() => globalThis.resumeStartupIcon());
    await icon.locator('img').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-custom-wallpaper]').count(), 0);
    await page.evaluate(() => globalThis.resumeStartupWallpaper());
    await page.locator('[data-custom-wallpaper]').waitFor();
    const frames = await page.evaluate(() => globalThis.assetFrames);
    assert.ok(frames.length > 0);
    assert.ok(frames.every(frame => !frame.image.includes('snow-mountain') && frame.textIcons === 0),
      `${mode}: no frame paints the default wallpaper or colored text replacement`);
  }
  assert.deepEqual(remote.filter(url => new URL(url).hostname === 'startup.invalid'), [],
    'The cached bookmark icon needs no network requests');
  assert.deepEqual(errors, []);
  console.log('PASS extension: new tab/reload, no default wallpaper/text-icon frames, independent decoding, interactive desktop/Launchpad during pending decode, offline local asset reuse without re-fetching');
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
/* global chrome, document, requestAnimationFrame, getComputedStyle, indexedDB, HTMLImageElement */
