import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const extension = path.resolve('dist-extension');
const html = await readFile(path.join(extension, 'index.html'), 'utf8');
const scripts = [...new Set([...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map(match => match[1]))];
const startupScriptBytes = (await Promise.all(scripts.map(file => stat(path.join(extension, file))))).reduce((sum, file) => sum + file.size, 0);
const output = path.resolve(process.env.STARTUP_REPORT ?? 'test-results/startup-performance.json');
const profile = await mkdtemp(path.join(tmpdir(), 'jigeqiu-startup-'));
const counts = (process.env.STARTUP_COUNTS ?? '0,1000,5000').split(',').map(Number);
const repeats = Number(process.env.STARTUP_REPEATS ?? 3);
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1440, height: 1000 },
  });
  await context.route(/^https?:/, route => route.abort());
  await context.addInitScript(() => {
    globalThis.startupMetrics = { loadingMessages: [], launchpad: [] };
    const panels = new WeakSet();
    new MutationObserver(() => {
      const metrics = globalThis.startupMetrics;
      for (const status of document.querySelectorAll('[role="status"]')) {
        if (/正在(?:读取本地数据|打开工作台|打开启动台)|Opening (?:the workbench|Launchpad)/i.test(status.textContent)) {
          metrics.loadingMessages.push(status.textContent);
        }
      }
      if (metrics.desktop === undefined && document.querySelector('[data-testid="desktop-viewport"]')) {
        metrics.desktop = null;
        requestAnimationFrame(() => requestAnimationFrame(() => { metrics.desktop = performance.now(); }));
      }
      const panel = document.querySelector('[data-panel="launchpad"]');
      if (panel && !panels.has(panel)) {
        panels.add(panel);
        requestAnimationFrame(() => requestAnimationFrame(() => { metrics.launchpad.push(performance.now()); }));
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  const setup = await context.newPage();
  await setup.goto('chrome://newtab/');
  await setup.getByRole('heading', { name: '使用前的隐私告知', exact: true }).waitFor();
  const report = {
    browser: context.browser()?.version(),
    conditions: 'Actual unpacked extension; synthetic Chinese/English data; external requests blocked; 1440x1000; no CPU throttle. Desktop and drawer measured after two animation frames. First sample per count cold page, subsequent samples warm. Timings are local lab results.',
    samples: [],
  };
  for (const count of counts) {
    await setup.evaluate(async count => {
      const bookmarks = Array.from({ length: count }, (_, index) => ({
        id: `bookmark-${index}`, title: `资源工具 Resource ${index}`, url: `https://startup.invalid/${index}`,
        domain: 'startup.invalid', notes: '工作开发工具', keywords: ['收藏', 'tool'],
        category: 'uncategorized', pinnedToDesktop: false, order: index, collectionIds: [],
        folderId: `folder-${Math.floor(index / 100)}`, createdAt: 1, updatedAt: 1,
      }));
      const folders = Array.from({ length: Math.ceil(count / 100) }, (_, index) => ({
        id: `folder-${index}`, name: `开发工具 ${index}`, bookmarkIds: bookmarks.slice(index * 100, (index + 1) * 100).map(bookmark => bookmark.id),
        pinnedToDesktop: false, order: index, createdAt: 1, updatedAt: 1,
      }));
      await chrome.storage.local.set({ 'jigeqiu-extension-state-v1': {
        version: 1, revision: count + 1, data: {
          'jigeqiu-extension-privacy-acknowledged': '2026-11-12.1',
          jipage_library_v2: JSON.stringify({ version: 1, bookmarks, folders, collections: [], bookmarkTrash: [], folderTrash: [], dockBookmarkIds: [] }),
          jipage_settings_v1: JSON.stringify({ language: 'zh', wallpaperPreset: 'misty-mountains' }),
        },
      } });
    }, count);
    for (let sample = 0; sample < repeats; sample++) {
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('chrome://newtab/');
      await page.waitForFunction(() => typeof globalThis.startupMetrics.desktop === 'number');
      const startup = { desktopMs: await page.evaluate(() => globalThis.startupMetrics.desktop), startupScriptBytes };
      for (let open = 0; open < 2; open++) {
        await page.evaluate(() => {
          globalThis.launchpadOpenedAt = performance.now();
          document.querySelector('[data-onboarding="launchpad"]').click();
        });
        await page.waitForFunction(open => globalThis.startupMetrics.launchpad.length > open, open);
        const elapsed = await page.evaluate(open => globalThis.startupMetrics.launchpad[open] - globalThis.launchpadOpenedAt, open);
        startup[open ? 'reopenMs' : 'firstOpenMs'] = elapsed;
        assert.equal(await page.locator('[data-launchpad-bookmark]').count(), count);
        await page.keyboard.press('Escape');
        await page.locator('[data-panel="launchpad"]').waitFor({ state: 'hidden' });
      }
      assert.deepEqual(await page.evaluate(() => globalThis.startupMetrics.loadingMessages), []);
      assert.deepEqual(errors, []);
      report.samples.push({ count, sample, ...startup });
      console.log(JSON.stringify({ count, sample, desktopMs: Math.round(startup.desktopMs), firstOpenMs: Math.round(startup.firstOpenMs), reopenMs: Math.round(startup.reopenMs), scriptBytes: startup.startupScriptBytes }));
      await page.close();
    }
  }
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(`Report: ${output}`);
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
/* global chrome, document, MutationObserver, requestAnimationFrame */
