import assert from 'node:assert/strict';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('https://**/*', route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(origin);
  await page.evaluate(async () => {
    const { StorageManager } = await import('/src/services/storage.ts');
    const manager = new StorageManager();
    for (let index = 0; index < 47; index++) {
      const bookmark = manager.saveManualBookmark({
        title: `Paging bookmark ${String(index).padStart(2, '0')}`, url: `https://paging-${index}.example/`,
        domain: `paging-${index}.example`, category: '', pinnedToDesktop: false,
        collectionIds: [], keywords: [], order: index,
      });
      if (index < 16) manager.deleteBookmark(bookmark.id);
    }
    for (let index = 0; index < 2; index++) {
      const folder = manager.createFolder(`Paging folder ${index}`);
      manager.trashFolder(folder.id);
    }
  });
  await page.goto(`${origin}/#/trash`);
  await page.reload();
  const trash = page.getByRole('region', { name: '回收站', exact: true });
  await trash.getByRole('listitem').first().waitFor();
  const snapshot = () => page.evaluate(() => localStorage.getItem('jipage_library_v2'));
  const original = await snapshot();
  assert.equal(await trash.getByRole('listitem').count(), 15);
  const next = () => trash.getByRole('button', { name: '下一页', exact: true }).click();
  await next();
  assert.equal(await trash.getByRole('listitem').count(), 3);
  assert.equal(await snapshot(), original, 'Pagination is read-only');
  const search = trash.getByRole('searchbox');
  await search.fill('Paging bookmark 00');
  assert.equal(await trash.getByRole('listitem').count(), 1);
  assert.equal(await trash.locator('[aria-current="page"]').textContent(), '1');
  await search.fill('no matching paging item');
  assert.equal(await trash.getByRole('listitem').count(), 0);
  assert.equal(await trash.getByRole('combobox').count(), 0);
  await search.fill('');
  await next();
  await trash.getByRole('combobox').selectOption('30');
  assert.equal(await trash.getByRole('listitem').count(), 18);
  assert.equal(await trash.locator('[aria-current="page"]').textContent(), '1');
  await trash.getByRole('combobox').selectOption('15');
  await next();
  await trash.getByRole('button', { name: '恢复收藏', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('jipage_library_v2')).bookmarkTrash.length === 15);
  assert.equal(await trash.getByRole('listitem').count(), 2);
  await trash.getByRole('button', { name: '恢复目录', exact: true }).first().click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('jipage_library_v2')).folderTrash.length === 1);
  await trash.getByRole('button', { name: '彻底删除目录', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '确认彻底删除目录', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('jipage_library_v2')).folderTrash.length === 0);
  await page.waitForFunction(() => document.querySelector('section[aria-label="回收站"] [aria-current="page"]')?.textContent === '1');
  assert.equal(await trash.getByRole('listitem').count(), 15);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: '切换为英文', exact: true }).click();
    const english = page.getByRole('region', { name: 'Trash', exact: true });
    await english.getByRole('combobox').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const boxes = await english.getByRole('button').evaluateAll(elements => elements.map(element => {
      const { left, right } = element.getBoundingClientRect(); return { left, right };
    }));
    assert.ok(boxes.every(box => box.left >= 0 && box.right <= width), 'Mobile controls stay within viewport');
    await page.screenshot({ path: `/tmp/trash-pagination-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Switch to Chinese', exact: true }).click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '切换夜间模式', exact: true }).click();
  assert.ok(await page.locator('html').evaluate(element => element.classList.contains('dark')));
  await page.screenshot({ path: '/tmp/trash-pagination-dark.png', fullPage: true });
  await page.goto(`${origin}/#/library`);
  await page.getByRole('button', { name: '下一页', exact: true }).waitFor();
  assert.equal(await page.locator('[data-library-bookmark]').count(), 15);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  assert.equal(await page.locator('[data-library-bookmark]').count(), 15);
  assert.equal(await page.getByRole('button', { name: '第 2 页', exact: true }).getAttribute('aria-current'), 'page');
  assert.deepEqual(errors, []);
  console.log('PASS shared pagination: mixed trash, search/size reset, read-only navigation, restore/purge last-page clamp, 320/390px English, library regression');
} finally {
  await browser?.close();
  await server.close();
}
