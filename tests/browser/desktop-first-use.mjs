import assert from 'node:assert/strict';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
const emptyLayout = { shortcuts: [], folders: [], root: [], dock: [] };
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const errors = [];
  const raw = page => page.evaluate(() => localStorage.getItem('jipage_library_v2'));
  const read = async page => JSON.parse(await raw(page));
  const audit = page => page.evaluate(() => window.assetWrites);
  const failWrites = (page, fail) => page.evaluate(value => { window.failAssetWrites = value; }, fail);
  const noMigration = async page => {
    assert.equal(await page.getByRole('button', { name: /预览桌面转换|确认转换|Preview desktop|Confirm conversion/i }).count(), 0);
    assert.equal(await page.getByRole('dialog', { name: /桌面布局转换|Desktop.*(?:conversion|upgrade)/i }).count(), 0);
  };
  async function fresh(width) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.route('https://**/*', route => route.abort());
    await context.addInitScript(() => {
      window.assetWrites = [];
      window.failAssetWrites = false;
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (this === localStorage && [
          'jipage_library_v2', 'jipage_bookmarks_v1', 'jipage_folders_v1',
          'jipage_collections_v1', 'jigeqiu_assets_v1',
        ].includes(key)) {
          if (window.failAssetWrites) throw new DOMException('Full', 'QuotaExceededError');
          window.assetWrites.push({ key, value });
        }
        return original.call(this, key, value);
      };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.getByTestId('desktop-viewport').waitFor();
    await noMigration(page);
    assert.equal(await raw(page), null, 'Fresh visit does not initialize the core asset record');
    const layouts = await page.evaluate(async () => {
      const { StorageManager } = await import('/src/services/storage.ts');
      const manager = new StorageManager();
      const first = manager.getDesktopLayout();
      const second = manager.getDesktopLayout();
      first.folders.push({ id: 'not-saved', name: 'Not saved', shortcutIds: [] });
      return {
        second, next: manager.getDesktopLayout(),
        removedApis: ['previewDesktopUpgrade', 'commitDesktopUpgrade'].every(key => !(key in manager)),
      };
    });
    assert.deepEqual(layouts.second, emptyLayout, 'Missing layout reads as a valid independent empty layout');
    assert.deepEqual(layouts.next, emptyLayout, 'Mutating a returned layout cannot change a later read');
    assert.equal(layouts.removedApis, true, 'Conversion APIs are removed');
    assert.deepEqual(await audit(page), [], 'Visiting and reading the layout do not write any asset key');
    await page.reload();
    await page.getByTestId('desktop-viewport').waitFor();
    assert.equal(await raw(page), null);
    assert.deepEqual(await audit(page), [], 'Reload remains read-only');
    return { context, page };
  }
  const assertSingleCommit = async page => {
    const writes = await audit(page);
    assert.equal(writes.length, 1, 'First desktop operation has one persistence owner, without an initialization commit');
    assert.equal(writes[0].key, 'jipage_library_v2');
    assert.equal(writes[0].value, await raw(page));
  };
  const survivesReload = async page => {
    const saved = await raw(page);
    await page.reload();
    await page.getByTestId('desktop-viewport').waitFor();
    await noMigration(page);
    assert.equal(await raw(page), saved, 'The complete first save survives reload byte-for-byte');
    assert.deepEqual(await audit(page), [], 'Reload must not rewrite the saved asset record');
  };
  for (const width of [1440, 390, 320]) {
    const { context, page } = await fresh(width);
    await page.getByTitle('新建桌面文件夹', { exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新建桌面文件夹', exact: true });
    await dialog.getByRole('textbox', { name: '文件夹名称', exact: true }).fill('Canceled first folder');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(await raw(page), null);
    assert.deepEqual(await audit(page), [], 'Opening and canceling the first folder leaves no asset data');
    await page.getByTitle('新建桌面文件夹', { exact: true }).click();
    await dialog.getByRole('textbox', { name: '文件夹名称', exact: true }).fill('First desktop folder');
    await failWrites(page, true);
    await dialog.getByRole('button', { name: '创建文件夹', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: /空间不足/ }).waitFor();
    assert.equal(await raw(page), null, 'Failed first folder creation cannot persist an empty initialization layout');
    assert.deepEqual(await audit(page), []);
    assert.equal(await dialog.getByRole('textbox', { name: '文件夹名称', exact: true }).inputValue(), 'First desktop folder');
    await failWrites(page, false);
    await dialog.getByRole('button', { name: '创建文件夹', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await assertSingleCommit(page);
    const saved = await read(page);
    assert.deepEqual(saved.bookmarks, []);
    assert.deepEqual(saved.folders, [], 'Desktop folders do not create archive folders');
    assert.equal(saved.desktopLayout.folders.length, 1);
    const folder = saved.desktopLayout.folders[0];
    assert.equal(folder.name, 'First desktop folder');
    assert.deepEqual(saved.desktopLayout, {
      ...emptyLayout, folders: [folder], root: [{ kind: 'desktop-folder', id: folder.id }],
    });
    assert.deepEqual(folder.shortcutIds, []);
    await survivesReload(page);
    await page.locator(`[data-desktop-id="${folder.id}"]`).waitFor();
    await context.close();
  }
  {
    const { context, page } = await fresh(1440);
    const legacy = {
      id: 'first-pin', title: 'First pinned website', url: 'https://first-pin.example/',
      domain: 'first-pin.example', category: '', pinnedToDesktop: true,
      order: 0, collectionIds: [], keywords: ['synthetic'], createdAt: 1, updatedAt: 2,
    };
    await page.evaluate(bookmark => {
      localStorage.setItem('jipage_bookmarks_v1', JSON.stringify([bookmark]));
      localStorage.setItem('jipage_folders_v1', '[]');
    }, legacy);
    await page.reload();
    await page.getByTestId('desktop-viewport').waitFor();
    await noMigration(page);
    assert.equal(await page.locator('[data-desktop-id]').count(), 0, 'Old pinnedToDesktop is not a desktop shortcut');
    assert.equal(await raw(page), null, 'Visiting legacy assets does not migrate or initialize them');
    assert.deepEqual(await audit(page), []);
    await page.getByRole('banner').getByRole('button', { name: '管理中心', exact: true }).click();
    const row = page.locator('[data-library-bookmark="first-pin"]');
    await row.getByTitle('固定到桌面', { exact: true }).waitFor();
    await failWrites(page, true);
    await row.getByTitle('固定到桌面', { exact: true }).click();
    await page.getByText(/存储空间不足/).waitFor();
    assert.equal(await raw(page), null, 'Failed first pin does not create a layout-only record');
    assert.deepEqual(await audit(page), []);
    await failWrites(page, false);
    await row.getByTitle('固定到桌面', { exact: true }).click();
    await row.getByTitle('从桌面移除', { exact: true }).waitFor();
    await assertSingleCommit(page);
    const saved = await read(page);
    assert.deepEqual(saved.bookmarks, [legacy], 'First pin preserves all legacy asset fields');
    assert.deepEqual(saved.folders, []);
    assert.equal(saved.desktopLayout.shortcuts.length, 1);
    const shortcut = saved.desktopLayout.shortcuts[0];
    assert.equal(shortcut.bookmarkId, legacy.id);
    assert.deepEqual(saved.desktopLayout, {
      ...emptyLayout, shortcuts: [shortcut], root: [{ kind: 'shortcut', id: shortcut.id }],
    });
    assert.equal(await page.evaluate(() => localStorage.getItem('jipage_bookmarks_v1')), JSON.stringify([legacy]));
    await page.getByRole('banner').getByRole('button', { name: '桌面', exact: true }).click();
    await survivesReload(page);
    await page.locator('[data-desktop-id="first-pin"]').waitFor();
    await context.close();
  }
  {
    const { context, page } = await fresh(390);
    await page.getByTitle('添加收藏', { exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: '添加收藏', exact: true });
    await dialog.getByLabel('网址 URL', { exact: true }).fill('https://first-add.example/');
    await dialog.getByLabel('网站名称', { exact: true }).fill('First added website');
    await dialog.getByLabel('同时固定到桌面', { exact: true }).check();
    await failWrites(page, true);
    await dialog.getByRole('button', { name: '添加收藏', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: /空间不足/ }).waitFor();
    assert.equal(await raw(page), null, 'Failed first add cannot save only an asset or only a layout');
    assert.deepEqual(await audit(page), []);
    assert.equal(await dialog.getByLabel('网站名称', { exact: true }).inputValue(), 'First added website');
    await failWrites(page, false);
    await dialog.getByRole('button', { name: '添加收藏', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await assertSingleCommit(page);
    const saved = await read(page);
    assert.equal(saved.bookmarks.length, 1);
    const bookmark = saved.bookmarks[0];
    assert.equal(bookmark.url, 'https://first-add.example/');
    assert.equal(bookmark.pinnedToDesktop, false, 'New assets do not use the legacy flag to pin');
    assert.deepEqual(saved.folders, []);
    assert.equal(saved.desktopLayout.shortcuts.length, 1);
    const shortcut = saved.desktopLayout.shortcuts[0];
    assert.equal(shortcut.bookmarkId, bookmark.id);
    assert.deepEqual(saved.desktopLayout, {
      ...emptyLayout, shortcuts: [shortcut], root: [{ kind: 'shortcut', id: shortcut.id }],
    });
    await survivesReload(page);
    await page.locator(`[data-desktop-id="${bookmark.id}"]`).waitFor();
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS read-only fresh visits/layout reads, removed migration APIs/UI, first folder at 1440/390/320px, legacy first pin and first add+pin: cancel/quota/retry, one atomic commit and reload persistence; run static-first-use for import isolation');
} finally {
  await browser?.close();
  await server.close();
}
