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
    const folder = manager.createFolder('Work');
    const saved = ['First', 'Second', 'Kept'].map((title, order) => manager.saveManualBookmark({
      title, url: `https://${title.toLowerCase()}.example/`, domain: `${title.toLowerCase()}.example`,
      category: '', order, folderId: folder.id, pinnedToDesktop: false, collectionIds: [], keywords: ['resource'],
    }));
    manager.saveFolders(manager.getFolders().map(item => ({ ...item, pinnedToDesktop: false })));
    manager.executeDesktop(saved.filter(bookmark => bookmark.title !== 'Second').map((bookmark, index) => ({
      type: 'desktop.pin', bookmarkId: bookmark.id, shortcutId: `shortcut-${bookmark.title}`,
      to: { kind: 'root', index },
    })));
    manager.saveUserSettings({ dockBookmarkIds: saved.map(item => item.id) });
  });
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    window.auditMode = '';
    window.libraryWrites = 0;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'jipage_library_v2') {
        if (window.auditMode === 'quota') throw new DOMException('Full', 'QuotaExceededError');
        window.libraryWrites++;
        if (window.auditMode === 'uncertain') value += ' ';
      }
      original.call(this, key, value);
    };
  });
  await page.reload();
  const header = page.getByRole('banner');
  const dock = page.getByTestId('bottom-dock');
  const dockItems = dock.locator('[draggable="true"]');
  const beforeDock = await page.evaluate(() => localStorage.getItem('jipage_library_v2'));
  await page.evaluate(() => { window.auditMode = 'quota'; });
  await dockItems.first().dragTo(dockItems.last());
  await page.getByText(/存储空间不足/).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('jipage_library_v2')), beforeDock);
  await page.evaluate(() => { window.auditMode = ''; window.libraryWrites = 0; });
  await dockItems.first().dragTo(dockItems.last());
  assert.equal(await page.evaluate(() => window.libraryWrites), 1, 'Taskbar reorder has one persistence owner');
  const reordered = await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_library_v2')));
  const original = JSON.parse(beforeDock);
  assert.deepEqual(reordered.dockBookmarkIds, [original.dockBookmarkIds[1], original.dockBookmarkIds[2], original.dockBookmarkIds[0]]);
  assert.deepEqual(reordered.bookmarks, original.bookmarks);
  assert.deepEqual(reordered.folders, original.folders);
  await header.getByRole('button', { name: '管理中心', exact: true }).click();
  const selectPair = async () => {
    for (const title of ['First', 'Second']) {
      await page.locator('[data-library-bookmark]').filter({ hasText: title }).getByRole('checkbox').check();
    }
  };
  await selectPair();
  await page.evaluate(() => { window.libraryWrites = 0; });
  const batchAction = name => page.getByRole('button', { name, exact: true })
    .and(page.locator('button:not([title])'));
  await batchAction('从桌面移除').click();
  assert.equal(await page.evaluate(() => window.libraryWrites), 1, 'Mixed pinned/unpinned selection is removed once');
  assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_library_v2')))).desktopLayout.shortcuts.length, 1);
  await selectPair();
  const beforePins = await page.evaluate(() => localStorage.getItem('jipage_library_v2'));
  await page.evaluate(() => { window.auditMode = 'quota'; });
  await batchAction('固定到桌面').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('jipage_library_v2')), beforePins);
  assert.equal(await page.locator('[data-library-bookmark] input:checked').count(), 2);
  await page.evaluate(() => { window.auditMode = ''; window.libraryWrites = 0; });
  await batchAction('固定到桌面').click();
  assert.equal(await page.evaluate(() => window.libraryWrites), 1);
  await selectPair();
  const before = await page.evaluate(() => localStorage.getItem('jipage_library_v2'));
  await page.getByRole('button', { name: '删除收藏…', exact: true }).first().click();
  let dialog = page.getByRole('dialog', { name: '删除 2 条收藏？', exact: true });
  await dialog.waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('jipage_library_v2')), before, 'Confirmation cannot write');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await page.locator('[data-library-bookmark] input:checked').count(), 2);
  await page.getByRole('button', { name: '删除收藏…', exact: true }).first().click();
  dialog = page.getByRole('dialog', { name: '删除 2 条收藏？', exact: true });
  await page.evaluate(() => { window.auditMode = 'quota'; });
  await dialog.getByRole('button', { name: '移至回收站', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: '存储空间不足' }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('jipage_library_v2')), before);
  await mkdir('/tmp/jigeqiu-mutations', { recursive: true });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const box = await dialog.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 900,
      'Batch confirmation and error remain within the viewport');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `/tmp/jigeqiu-mutations/batch-delete-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => { window.auditMode = ''; window.libraryWrites = 0; });
  await dialog.getByRole('button', { name: '移至回收站', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.libraryWrites), 1);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_library_v2')));
  assert.deepEqual(after.bookmarks.map(item => item.title), ['Kept']);
  assert.equal(after.bookmarkTrash.length, 2);
  assert.equal(after.folders[0].bookmarkIds.length, 1);
  assert.equal(after.desktopLayout.shortcuts.length, 1);
  assert.equal(after.dockBookmarkIds.length, 1);
  assert.equal(await page.locator('[data-library-bookmark]').count(), 1);

  const nav = page.getByRole('navigation', { name: '管理中心导航', exact: true });
  await nav.getByRole('button', { name: '回收站', exact: true }).click();
  const rows = page.locator('section[aria-label="回收站"] li');
  assert.equal(await rows.count(), 2);
  await page.evaluate(() => { window.auditMode = 'quota'; });
  await rows.last().getByRole('button', { name: '恢复收藏', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '存储空间不足' }).waitFor();
  assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_library_v2')))).bookmarkTrash.length, 2);
  await page.evaluate(() => { window.auditMode = ''; window.libraryWrites = 0; });
  await rows.last().getByRole('button', { name: '恢复收藏', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('jipage_library_v2')).bookmarkTrash.length === 1);
  assert.equal(await page.evaluate(() => window.libraryWrites), 1);
  assert.equal(await rows.count(), 1);
  await page.evaluate(() => { window.auditMode = 'uncertain'; });
  await rows.first().getByRole('button', { name: '恢复收藏', exact: true }).click();
  const warning = page.getByRole('alert').filter({ hasText: /结果无法确认/ });
  await warning.waitFor();
  assert.match(await warning.innerText(), /刷新/);
  assert.doesNotMatch(await warning.innerText(), /仍保留在回收站/);
  await page.reload();
  await header.getByRole('button', { name: '管理中心', exact: true }).click();
  await nav.getByRole('button', { name: '回收站', exact: true }).click();
  await page.getByText('回收站为空', { exact: true }).waitFor();
  await nav.getByRole('button', { name: '全部收藏', exact: true }).click();
  assert.equal(await page.locator('[data-library-bookmark]').count(), 3);
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_library_v2')));
  assert.deepEqual(restored.bookmarks.map(bookmark => bookmark.title), ['First', 'Second', 'Kept']);
  assert.deepEqual(restored.folders[0].bookmarkIds, original.folders[0].bookmarkIds);
  assert.deepEqual(errors, []);
  console.log('PASS taskbar reorder, mixed desktop pins, batch delete confirm/cancel/quota/retry/single commit, 320/390px, reverse restore order and uncertain feedback/reload');
} finally {
  await browser?.close();
  await server.close();
}
