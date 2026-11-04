import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('https://**/*', route => route.fulfill({ body: '' }));
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.evaluate(async () => {
    const { StorageManager } = await import('/src/services/storage.ts');
    const manager = new StorageManager();
    const parent = manager.createFolder('Parent');
    const root = manager.createFolder('Work', [], parent.id);
    const nested = manager.createFolder('Nested', [], root.id);
    const add = (title, folderId) => manager.saveManualBookmark({
      title, url: `https://${title}.example/`, domain: 'example', folderId,
      category: '', pinnedToDesktop: false, collectionIds: [], keywords: ['recover'], order: 0,
    });
    add('first', root.id);
    add('second', nested.id);
    window.fixture = { parent, root, nested };
  });
  await page.reload();
  const manage = () => page.getByRole('banner').getByRole('button', { name: '管理中心', exact: true }).click();
  const section = async id => {
    const mobile = page.getByLabel('管理中心小节', { exact: true });
    if (await mobile.isVisible()) await mobile.selectOption(id);
    else await page.getByRole('navigation', { name: '管理中心导航' })
      .getByRole('button', { name: id === 'trash' ? '回收站' : '全部收藏', exact: true }).click();
  };
  const snapshot = () => page.evaluate(() => JSON.parse(localStorage.getItem('jipage_library_v2')));
  const openRemove = async name => {
    const row = page.locator('[data-library-folder]').filter({ has: page.getByText(name, { exact: true }) });
    await row.hover();
    await row.getByTitle('移除收藏库文件夹…').click();
  };
  await manage();
  await openRemove('Work');
  const dialog = page.getByRole('dialog', { name: '移除收藏库文件夹', exact: true });
  await dialog.waitFor();
  await mkdir('/tmp/jigeqiu-folder-trash', { recursive: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `/tmp/jigeqiu-folder-trash/confirm-${width}.png` });
    const box = await dialog.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const before = await snapshot();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  assert.deepEqual(await snapshot(), before);
  await openRemove('Work');
  await page.evaluate(() => {
    window.originalWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  });
  await dialog.getByRole('button', { name: '连同内容删除', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  assert.deepEqual(await snapshot(), before);
  await page.evaluate(() => {
    window.libraryWrites = 0;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'jipage_library_v2' && ++window.libraryWrites > 1) {
        throw new DOMException('Unexpected second commit', 'QuotaExceededError');
      }
      return window.originalWrite.call(this, key, value);
    };
  });
  await dialog.getByRole('button', { name: '连同内容删除', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.libraryWrites), 1);
  await page.evaluate(() => { Storage.prototype.setItem = window.originalWrite; });
  assert.equal((await snapshot()).folderTrash[0].folders.length, 2);
  await section('trash');
  await page.getByText('Work', { exact: true }).waitFor();
  await page.reload();
  await manage();
  await section('trash');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `/tmp/jigeqiu-folder-trash/trash-${width}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.getByRole('button', { name: '恢复目录', exact: true }).click();
  await page.getByText('回收站为空', { exact: true }).waitFor();
  assert.deepEqual((await snapshot()).folders.map(folder => folder.id), before.folders.map(folder => folder.id));
  await section('bookmarks');
  await openRemove('Work');
  await page.evaluate(() => {
    window.libraryWrites = 0;
    window.originalWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'jipage_library_v2' && ++window.libraryWrites > 1) {
        throw new DOMException('Unexpected second commit', 'QuotaExceededError');
      }
      return window.originalWrite.call(this, key, value);
    };
  });
  await dialog.getByRole('button', { name: '解散并保留内容', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.libraryWrites), 1);
  await page.evaluate(() => { Storage.prototype.setItem = window.originalWrite; });
  const dissolved = await snapshot();
  assert.equal(dissolved.bookmarks.length, 2);
  assert.equal(dissolved.folders.find(folder => folder.name === 'Nested').parentId,
    dissolved.folders.find(folder => folder.name === 'Parent').id);
  await openRemove('Nested');
  await dialog.getByRole('button', { name: '连同内容删除', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await section('trash');
  await page.getByRole('button', { name: '彻底删除目录', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  assert.equal((await snapshot()).folderTrash.length, 1);
  await page.getByRole('button', { name: '彻底删除目录', exact: true }).click();
  await page.getByRole('button', { name: '确认彻底删除目录', exact: true }).click();
  await page.getByText('回收站为空', { exact: true }).waitFor();
  assert.equal((await snapshot()).bookmarks.length, 1);
  await page.getByRole('banner').getByRole('button', { name: '切换为英文', exact: true }).click();
  await page.getByLabel('Management section', { exact: true }).selectOption('bookmarks');
  const parentRow = page.locator('[data-library-folder]').filter({ has: page.getByText('Parent', { exact: true }) });
  await parentRow.getByTitle('Remove library folder…').click();
  const englishDialog = page.getByRole('dialog', { name: 'Remove library folder', exact: true });
  for (const dark of [false, true]) {
    await page.evaluate(value => document.documentElement.classList.toggle('dark', value), dark);
    await page.screenshot({ path: `/tmp/jigeqiu-folder-trash/confirm-en-${dark ? 'dark' : 'light'}-320.png` });
    const box = await englishDialog.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 320);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await englishDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log('PASS archive folder cancel/quota retry/subtree trash/reload/restore/dissolve/purge and 320/390px');
} finally {
  await browser?.close();
  await server.close();
}
