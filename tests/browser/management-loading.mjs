import assert from 'node:assert/strict';
import { preview } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
const errors = [];
async function session(width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await context.addInitScript(() => {
    localStorage.setItem('jipage_bookmarks_v1', JSON.stringify([{
      id: 'kept', title: '中文工具', url: 'https://example.invalid/', domain: 'example.invalid',
      category: 'uncategorized', order: 0, pinnedToDesktop: false, collectionIds: [], createdAt: 1, updatedAt: 1,
    }]));
    localStorage.setItem('jipage_settings_v1', JSON.stringify({ language: 'en' }));
    // Exercise navigation without relying on idle warming or a fast disk.
    window.requestIdleCallback = () => 1;
    window.cancelIdleCallback = () => {};
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
}
async function holdChunk(context, name) {
  let release;
  const ready = context.waitForEvent('request', {
    predicate: request => new URL(request.url()).pathname.startsWith(`/assets/${name}-`),
    timeout: 10000,
  });
  // A failed earlier assertion may close the context before this particular request.
  void ready.catch(() => {});
  const gate = new Promise(resolve => { release = resolve; });
  await context.route(`**/assets/${name}-*.js`, async route => {
    await gate;
    await route.continue();
  });
  return { ready, release };
}
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
  // Cold deep links and refreshes show usable navigation before the content module arrives.
  for (const [hash, chunk, heading] of [
    ['#/library', 'UserCenterView', 'All bookmarks'],
    ['#/trash', 'BookmarkTrashView', 'Recycle bin'],
  ]) {
    for (const width of [1440, 390]) {
      const { context, page } = await session(width);
      const held = await holdChunk(context, chunk);
      try {
        await page.goto(`${origin}/${hash}`, { waitUntil: 'domcontentloaded' });
        await held.ready;
        await page.getByRole('banner').waitFor();
        assert.equal(await page.getByRole('heading', { name: heading, exact: true, level: 1 }).isVisible(), true,
          'The real management frame must remain visible while its content is loading');
        assert.equal(await page.locator('[aria-busy="true"]').isVisible(), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: `/tmp/jigeqiu-management-loading-${chunk}-${width}.png` });
        held.release();
        await page.locator('[aria-busy="true"]').waitFor({ state: 'detached' });
        await page.reload();
        await page.getByRole('heading', { name: heading, exact: true, level: 1 }).waitFor();
        await page.locator('[aria-busy="true"]').waitFor({ state: 'detached' });
      } finally { held.release(); await context.close(); }
    }
  }
  // An uncached destination must not replace an already visible page with blank content.
  {
    const { context, page } = await session();
    const management = await holdChunk(context, 'UserCenterView');
    const trash = await holdChunk(context, 'BookmarkTrashView');
    try {
      await page.goto(origin);
      const desktop = page.getByTestId('desktop-viewport');
      await desktop.waitFor();
      await page.getByRole('banner').getByRole('button', { name: 'Manage', exact: true }).click();
      await management.ready;
      assert.equal(await desktop.isVisible(), true, 'Desktop stays visible until management is ready');
      management.release();
      await page.getByRole('heading', { name: 'All bookmarks', exact: true, level: 1 }).waitFor();
      const nav = page.getByRole('navigation', { name: 'Management navigation', exact: true });
      await nav.getByRole('button', { name: 'Recycle bin', exact: true }).click();
      await trash.ready;
      assert.equal(await page.getByRole('heading', { name: 'All bookmarks', exact: true, level: 1 }).isVisible(), true,
        'The previous management content stays visible during a slow switch');
      // The user can cancel a pending destination without a late import sending them back.
      await page.getByRole('banner').getByRole('button', { name: 'Desktop', exact: true }).click();
      await desktop.waitFor();
      trash.release();
      await page.getByRole('banner').getByRole('button', { name: 'Manage', exact: true }).click();
      await page.getByRole('heading', { name: 'All bookmarks', exact: true, level: 1 }).waitFor();
      await nav.getByRole('button', { name: 'Recycle bin', exact: true }).click();
      await page.getByRole('heading', { name: 'Recycle bin', exact: true, level: 1 }).waitFor();
      await page.goBack();
      await page.getByRole('heading', { name: 'All bookmarks', exact: true, level: 1 }).waitFor();
    } finally { management.release(); trash.release(); await context.close(); }
  }
  // Intent warms code without navigating; unrelated management features stay deferred.
  {
    const { context, page } = await session();
    const paths = [];
    const heldWallpaper = await holdChunk(context, 'WallpaperSettings');
    const heldTransfer = await holdChunk(context, 'AssetTransferPage');
    page.on('request', request => paths.push(new URL(request.url()).pathname));
    try {
      await page.goto(origin);
      await page.getByTestId('desktop-viewport').waitFor();
      const requested = page.waitForRequest('**/assets/UserCenterView-*.js');
      await page.getByRole('banner').getByRole('button', { name: 'Manage', exact: true }).focus();
      await requested;
      assert.equal(new URL(page.url()).hash, '#/');
      await page.getByRole('banner').getByRole('button', { name: 'Manage', exact: true }).click();
      await page.getByRole('heading', { name: 'All bookmarks', exact: true, level: 1 }).waitFor();
      const search = page.getByRole('searchbox', { name: 'Search by name, URL, or keywords...', exact: true });
      const rows = page.locator('[data-library-bookmark]');
      assert.equal(await rows.count(), 1, 'Browsing needs no search index to display bookmarks');
      await search.fill('zwgj');
      assert.equal(await rows.count(), 1, 'Pinyin search still builds its index when needed');
      await search.fill('no-match');
      assert.equal(await rows.count(), 0);
      await search.fill('');
      assert.equal(await rows.count(), 1, 'Clearing search returns to browsing');
      assert.equal(paths.some(path => /\/(AssetTransferPage|WallpaperSettings)-/.test(path)), false,
        'Bookmark management does not load import/export or wallpaper editors');
      const nav = page.getByRole('navigation', { name: 'Management navigation', exact: true });
      const wallpaper = page.waitForRequest('**/assets/WallpaperSettings-*.js');
      await nav.getByRole('button', { name: 'Appearance', exact: true }).hover();
      await wallpaper;
      assert.equal(new URL(page.url()).hash, '#/library');
      await nav.getByRole('button', { name: 'Appearance', exact: true }).click();
      assert.equal(await page.getByRole('heading', { name: 'All bookmarks', exact: true, level: 1 }).isVisible(), true,
        'A nested settings module does not blank the bookmark list');
      heldWallpaper.release();
      await page.getByRole('heading', { name: 'Appearance', exact: true, level: 1 }).waitFor();
      const transfer = page.waitForRequest('**/assets/AssetTransferPage-*.js');
      await nav.getByRole('button', { name: 'Import & export', exact: true }).focus();
      await transfer;
      await nav.getByRole('button', { name: 'Import & export', exact: true }).click();
      assert.equal(await page.getByRole('heading', { name: 'Appearance', exact: true, level: 1 }).isVisible(), true);
      heldTransfer.release();
      await page.getByRole('heading', { name: 'Import & export', exact: true, level: 1 }).waitFor();
    } finally { heldWallpaper.release(); heldTransfer.release(); await context.close(); }
  }
  assert.deepEqual(errors, []);
  console.log('PASS management loading: cold frames, mobile, reload, retained navigation, cancellation, history, intent preloading and feature splitting');
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
