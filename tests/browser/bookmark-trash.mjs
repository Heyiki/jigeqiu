import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('https://**/*', route => route.fulfill({ body: '' }));
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.evaluate(async () => {
    const { StorageManager } = await import('/src/services/storage.ts');
    const manager = new StorageManager();
    const folder = manager.createFolder('Original archive');
    const bookmark = manager.saveManualBookmark({
      title: 'Recover me', url: 'https://recover.example/', domain: 'recover.example', category: 'cat-inbox',
      folderId: folder.id, pinnedToDesktop: false, collectionIds: [], keywords: ['restore'], order: 0,
    });
    manager.executeDesktop([{ type: 'desktop.pin', bookmarkId: bookmark.id, shortcutId: 'shortcut', to: { kind: 'root', index: 0 } }]);
    manager.saveUserSettings({ dockBookmarkIds: [bookmark.id] });
  });
  await page.reload();
  const manage = () => page.getByRole('banner').getByRole('button', { name: '管理中心', exact: true }).click();
  const section = async name => {
    const mobile = page.getByLabel('管理中心小节', { exact: true });
    if (await mobile.isVisible()) await mobile.selectOption(name === '回收站' ? 'trash' : 'bookmarks');
    else await page.getByRole('navigation', { name: '管理中心导航', exact: true }).getByRole('button', { name, exact: true }).click();
  };
  await manage();
  await page.getByTitle('删除收藏…', { exact: true }).click();
  await page.getByRole('button', { name: '移至回收站', exact: true }).click();
  await section('回收站');
  await page.getByText('Recover me', { exact: true }).waitFor();
  const snapshot = () => page.evaluate(() => JSON.parse(localStorage.getItem('jipage_library_v2')));
  let data = await snapshot();
  assert.equal(data.bookmarks.length, 0);
  assert.equal(data.desktopLayout.shortcuts.length, 0);
  assert.deepEqual(data.dockBookmarkIds, []);
  const originalId = data.bookmarkTrash[0].bookmark.id;
  await page.reload();
  await manage();
  await section('回收站');
  await page.getByRole('button', { name: '恢复收藏', exact: true }).click();
  await page.getByText('回收站为空', { exact: true }).waitFor();
  data = await snapshot();
  assert.equal(data.bookmarks[0].id, originalId);
  assert.equal(data.bookmarks[0].folderId, data.folders[0].id);
  assert.equal(data.desktopLayout.shortcuts.length, 0);
  assert.deepEqual(data.dockBookmarkIds, []);
  await section('全部收藏');
  await page.getByTitle('删除收藏…', { exact: true }).click();
  await page.getByRole('button', { name: '移至回收站', exact: true }).click();
  await section('回收站');
  await page.getByRole('button', { name: '彻底删除收藏', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  assert.equal((await snapshot()).bookmarkTrash.length, 1);
  await mkdir('/tmp/jigeqiu-trash', { recursive: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `/tmp/jigeqiu-trash/trash-${width}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await page.getByRole('button', { name: '彻底删除收藏', exact: true }).click();
  await page.getByRole('button', { name: '确认彻底删除', exact: true }).click();
  await page.getByText('回收站为空', { exact: true }).waitFor();
  assert.equal((await snapshot()).bookmarkTrash.length, 0);
  console.log('PASS manager delete/reload/restore identity+archive without desktop/Dock, purge cancel/confirm and 320/390px');
} finally {
  await browser?.close();
  await server.close();
}
