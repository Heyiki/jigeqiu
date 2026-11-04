import assert from 'node:assert/strict';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.route('https://**/*', route => route.fulfill({ body: '' }));
  const page = await context.newPage();
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(url);
  assert.equal(await page.locator('[data-bookmark-id]').count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('jipage_library_v2')), null);
  await page.keyboard.press('Control+Shift+Space');
  await page.getByText('暂无收藏', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('banner').getByRole('button', { name: '管理中心', exact: true }).click();
  await page.getByRole('heading', { name: '全部收藏', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '我的网址单', exact: true }).count(), 0);
  await page.getByRole('banner').getByRole('button', { name: '桌面', exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('jipage_library_v2')), null);
  const other = await context.newPage();
  await other.goto(url);
  const fill = async (tab, title, address) => {
    await tab.keyboard.press('Control+Shift+Enter');
    const dialog = tab.getByRole('dialog').filter({ has: tab.getByLabel('网址 URL', { exact: true }) });
    await dialog.getByLabel('网址 URL', { exact: true }).fill(address);
    await dialog.getByLabel('网站名称', { exact: true }).fill(title);
    await dialog.getByRole('checkbox').uncheck();
    return dialog;
  };
  let dialog = await fill(page, 'Saved personal bookmark', 'https://personal.example/');
  await dialog.getByRole('button', { name: '添加收藏', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const saved = await page.evaluate(() => localStorage.getItem('jipage_library_v2'));
  assert.equal(JSON.parse(saved).bookmarks.length, 1);
  dialog = await fill(other, 'Stale draft', 'https://stale.example/');
  await dialog.getByRole('button', { name: '添加收藏', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(await dialog.getByLabel('网站名称', { exact: true }).inputValue(), 'Stale draft');
  assert.equal(await other.evaluate(() => localStorage.getItem('jipage_library_v2')), saved);
  await page.reload();
  dialog = await fill(page, 'Quota draft', 'https://quota.example/');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'jipage_library_v2') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await dialog.getByRole('button', { name: '添加收藏', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(await dialog.getByLabel('网站名称', { exact: true }).inputValue(), 'Quota draft');
  assert.equal(await page.evaluate(() => localStorage.getItem('jipage_library_v2')), saved);
  await page.reload();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_library_v2')).bookmarks[0].title),
    'Saved personal bookmark');
  console.log('PASS fresh formal empty assets, save/reload, stale second tab refusal, quota error/draft preservation and unchanged original bytes');
} finally {
  await browser?.close();
  await server.close();
}
