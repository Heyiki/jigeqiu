import assert from 'node:assert/strict';
import { preview } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
  for (const scenario of ['immediate', 'direct', 'mobile']) {
    const context = await browser.newContext({ viewport: { width: scenario === 'mobile' ? 390 : 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    const deferredRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (/\/(?:UserCenterView|BookmarkTrashView|BuiltinTools)-[^/]+\.js$/.test(new URL(request.url()).pathname)) deferredRequests.push(request.url());
    });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(() => {
      localStorage.setItem('jipage_bookmarks_v1', JSON.stringify([{
        id: 'first-open', title: '中文工具', url: 'https://first-open.invalid/tool',
        domain: 'first-open.invalid', keywords: ['测试'], notes: '', category: 'uncategorized',
        pinnedToDesktop: false, order: 0, collectionIds: [], createdAt: 1, updatedAt: 1,
      }]));
      localStorage.setItem('jipage_settings_v1', JSON.stringify({ language: 'en', appearanceMode: 'dark-glass' }));
      // No idle preloading may be required for the very first interaction.
      window.requestIdleCallback = () => 1;
      window.cancelIdleCallback = () => {};
      globalThis.loadingMessages = [];
      new MutationObserver(() => {
        for (const status of document.querySelectorAll('[role="status"]')) {
          if (/Opening Launchpad|正在打开启动台/.test(status.textContent)) globalThis.loadingMessages.push(status.textContent);
        }
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await page.goto(`${origin}/${scenario === 'direct' ? '#/start' : ''}`);
    const launchpad = page.locator('[data-panel="launchpad"]');
    if (scenario !== 'direct') {
      await page.getByTestId('desktop-viewport').waitFor();
      assert.equal(await launchpad.count(), 0, 'The drawer is not mounted before opening');
      await page.locator('[data-onboarding="launchpad"]').click();
    }
    await launchpad.waitFor();
    assert.deepEqual(await page.evaluate(() => globalThis.loadingMessages), [], 'First open never renders a loading screen');
    const search = launchpad.getByRole('searchbox');
    assert.equal(await search.evaluate(element => element === document.activeElement), true);
    await search.fill('zwgj');
    await launchpad.locator('[data-launchpad-bookmark="first-open"]').waitFor();
    const libraryBefore = await page.evaluate(() => localStorage.getItem('jipage_library_v2'));
    await page.keyboard.press('Escape');
    await launchpad.waitFor({ state: 'hidden' });
    await page.locator('[data-onboarding="launchpad"]').click();
    await launchpad.waitFor();
    assert.equal(await search.inputValue(), '', 'Reopening resets search');
    assert.equal(await page.evaluate(() => localStorage.getItem('jipage_library_v2')), libraryBefore);
    assert.deepEqual(deferredRequests, [], 'Desktop and Launchpad do not load management or tools before idle');
    await page.keyboard.press('Escape');
    await launchpad.waitFor({ state: 'hidden' });
    await page.getByRole('banner').getByRole('button', { name: 'Manage', exact: true }).click();
    await page.getByRole('heading', { name: 'All bookmarks', exact: true }).waitFor();
    assert.ok(deferredRequests.some(url => url.includes('/UserCenterView-')), 'Management code loads only when requested');
    if (scenario === 'immediate') {
      for (const [hash, heading] of [
        ['#/settings/appearance', 'Appearance'],
        ['#/settings/search-engines', 'Search engines'],
        ['#/settings/import-export', 'Import & export'],
        ['#/trash', 'Recycle bin'],
      ]) {
        await page.goto(`${origin}/${hash}`);
        await page.getByRole('heading', { name: heading, exact: true, level: 1 }).waitFor();
        await page.locator('[aria-busy="true"]').waitFor({ state: 'detached' });
        await page.reload();
        await page.getByRole('heading', { name: heading, exact: true, level: 1 }).waitFor();
        await page.locator('[aria-busy="true"]').waitFor({ state: 'detached' });
      }
    }
    assert.deepEqual(errors, []);
    console.log(`${scenario}: direct render, focus, pinyin search and reopening passed`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
