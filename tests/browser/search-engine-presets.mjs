import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const built = process.env.TEST_BUILD === 'true';
const server = built ? await preview({ preview: { host: '127.0.0.1', port: 0 } })
  : await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  if (!built) await server.listen();
  browser = await chromium.launch({ headless: true });
  await mkdir('/tmp/jigeqiu-search-presets', { recursive: true });
  for (const language of ['zh', 'en']) {
    const en = language === 'en';
    const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, reducedMotion: 'reduce' });
    await context.route('https://**/*', route => route.fulfill({ body: '' }));
    await context.addInitScript(language => {
      if (!localStorage.getItem('jipage_settings_v1')) localStorage.setItem('jipage_settings_v1', JSON.stringify({
        language, defaultSearchEngineId: 'se-baidu', reduceMotion: true,
      }));
    }, language);
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/#/settings/search-engines`);
    const before = await page.evaluate(() => ({
      settings: localStorage.getItem('jipage_settings_v1'), library: localStorage.getItem('jipage_library_v2'),
      engines: localStorage.getItem('jipage_search_engines_v1'),
    }));
    const open = page.getByRole('button', { name: en ? 'Engine library' : '引擎库', exact: true });
    await open.click();
    const dialog = page.getByRole('dialog', { name: en ? 'Popular search sites' : '常用搜索站点', exact: true });
    assert.equal(await dialog.locator('[data-search-preset]').count(), 31);
    assert.equal(await dialog.getByRole('checkbox').count(), 31);
    assert.equal(await dialog.getByRole('checkbox', { disabled: true }).count(), 8);
    await page.screenshot({ path: `/tmp/jigeqiu-search-presets/${language}-catalog-desktop.png` });
    const search = dialog.getByRole('searchbox', { name: en ? 'Search sites' : '搜索站点' });
    await search.fill('yahoo');
    assert.equal(await dialog.locator('[data-search-preset]').count(), 1);
    await dialog.getByRole('checkbox').check();
    await search.fill('今日头条');
    assert.equal(await dialog.locator('[data-search-preset]').count(), 1);
    await dialog.getByRole('checkbox').check();
    await search.fill('nothing-matches-this-site');
    await dialog.getByText(en ? 'No matching sites' : '没有匹配的站点', { exact: true }).waitFor();
    await search.fill('');
    await dialog.getByRole('combobox', { name: en ? 'Site category' : '站点分类' }).selectOption('cars');
    assert.equal(await dialog.locator('[data-search-preset]').count(), 2);
    await dialog.getByRole('button', { name: en ? 'Select current results' : '全选当前结果', exact: true }).click();
    const add = dialog.getByRole('button', { name: en ? 'Add selected (4)' : '添加所选（4）', exact: true });
    await page.evaluate(() => {
      window.savedSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'jipage_search_engines_v1') throw new DOMException('Full', 'QuotaExceededError');
        return window.savedSetItem.call(this, key, value);
      };
    });
    await add.click();
    await dialog.getByRole('alert').filter({ hasText: en ? /storage is full/ : /空间不足/ }).waitFor();
    assert.equal(await dialog.getByRole('checkbox', { checked: true }).count(), 2);
    assert.equal(await page.evaluate(() => localStorage.getItem('jipage_search_engines_v1')), before.engines);
    await page.evaluate(() => { Storage.prototype.setItem = window.savedSetItem; });
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
      for (const width of [1280, 390, 320]) {
        const height = width === 320 ? 640 : width === 390 ? 844 : 960;
        await page.setViewportSize({ width, height });
        const box = await dialog.boundingBox();
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.equal(await dialog.evaluate(element => element.scrollWidth > element.clientWidth), false);
        await page.screenshot({ path: `/tmp/jigeqiu-search-presets/${language}-${dark ? 'dark' : 'light'}-${width}.png` });
      }
    }
    await add.click();
    await dialog.waitFor({ state: 'hidden' });
    const after = await page.evaluate(() => ({
      settings: localStorage.getItem('jipage_settings_v1'), library: localStorage.getItem('jipage_library_v2'),
      engines: JSON.parse(localStorage.getItem('jipage_search_engines_v1')),
    }));
    assert.equal(after.settings, before.settings);
    assert.equal(after.library, before.library);
    assert.equal(after.engines.length, 12);
    assert.equal(after.engines.filter(engine => ['se-toutiao', 'se-yahoo', 'se-dongchedi', 'se-autohome'].includes(engine.id)).length, 4);
    await page.reload();
    await open.click();
    assert.equal(await dialog.getByRole('checkbox', { disabled: true }).count(), 12);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 1280, height: 960 });
    await open.focus();
    await page.keyboard.press('Enter');
    await dialog.waitFor();
    assert.ok(await dialog.evaluate(element => element.contains(document.activeElement)));
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.ok(await open.evaluate(element => element === document.activeElement));
    await open.click();
    await dialog.getByRole('button', { name: en ? 'Select current results' : '全选当前结果', exact: true }).click();
    await dialog.getByRole('button', { name: en ? 'Clear selection' : '清空选择', exact: true }).click();
    assert.equal(await dialog.getByRole('checkbox', { checked: true }).count(), 0);
    assert.ok(await dialog.getByRole('button', { name: en ? 'Add selected (0)' : '添加所选（0）', exact: true }).isDisabled());
    await page.keyboard.press('Escape');
    // A queued batch must reread another tab's edit under the same lock.
    const other = await context.newPage();
    await other.goto(`http://127.0.0.1:${server.httpServer.address().port}/#/settings/search-engines`);
    await other.evaluate(() => {
      window.engineLockHeld = false;
      window.engineLockTask = navigator.locks.request('jigeqiu:prototype:search-engines', async () => {
        window.engineLockHeld = true;
        await new Promise(resolve => { window.releaseEngineLock = resolve; });
        const engines = JSON.parse(localStorage.getItem('jipage_search_engines_v1'));
        engines.push({
          id: 'other-tab', name: 'Other tab', keyword: 'other',
          urlTemplate: 'https://other.example/?q={query}', icon: 'Search', isDefault: false,
        });
        localStorage.setItem('jipage_search_engines_v1', JSON.stringify(engines));
      });
    });
    await other.waitForFunction(() => window.engineLockHeld);
    await open.click();
    await dialog.getByRole('searchbox').fill('csdn');
    await dialog.getByRole('checkbox').check();
    const queuedAdd = dialog.getByRole('button', { name: en ? 'Add selected (1)' : '添加所选（1）', exact: true });
    await queuedAdd.click();
    assert.ok(await queuedAdd.isDisabled());
    await other.evaluate(() => { window.releaseEngineLock(); return window.engineLockTask; });
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_search_engines_v1'))
      .filter(engine => ['se-csdn', 'other-tab'].includes(engine.id)).length), 2);
    // Closing the picker while waiting must cancel the queued write.
    await other.evaluate(() => {
      window.engineLockHeld = false;
      window.engineLockTask = navigator.locks.request('jigeqiu:prototype:search-engines', async () => {
        window.engineLockHeld = true;
        await new Promise(resolve => { window.releaseEngineLock = resolve; });
      });
    });
    await other.waitForFunction(() => window.engineLockHeld);
    await open.click();
    await dialog.getByRole('searchbox').fill('juejin');
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: en ? 'Add selected (1)' : '添加所选（1）', exact: true }).click();
    await page.keyboard.press('Escape');
    await other.evaluate(() => { window.releaseEngineLock(); return window.engineLockTask; });
    // Acquiring the lock again drains the canceled operation before checking storage.
    await page.evaluate(() => navigator.locks.request('jigeqiu:prototype:search-engines', () => {}));
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_search_engines_v1'))
      .some(engine => engine.id === 'se-juejin')), false);
    await other.close();
    // A user-defined keyword collision must be visible and must never be overwritten.
    await page.evaluate(() => {
      const engines = JSON.parse(localStorage.getItem('jipage_search_engines_v1'));
      engines.push({
        id: 'my-shenma-keyword', name: 'Private engine', keyword: 'sm',
        urlTemplate: 'https://private.example/?q={query}', icon: 'Search', isDefault: false, isEnabled: false,
      });
      localStorage.setItem('jipage_search_engines_v1', JSON.stringify(engines));
    });
    await page.reload();
    await open.click();
    await dialog.getByRole('searchbox').fill('sm.cn');
    await dialog.getByText(en ? 'Shortcut already in use' : '快捷指令已被占用', { exact: true }).waitFor();
    assert.ok(await dialog.getByRole('checkbox').isDisabled());
    await dialog.getByRole('searchbox').fill('juejin');
    await dialog.getByRole('checkbox').check();
    // A write whose readback cannot be confirmed blocks retry until the user reloads.
    await page.evaluate(() => {
      window.savedSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        return window.savedSetItem.call(this, key, key === 'jipage_search_engines_v1' ? `${value} ` : value);
      };
    });
    await dialog.getByRole('button', { name: en ? 'Add selected (1)' : '添加所选（1）', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    assert.ok(await dialog.getByRole('button', { name: en ? 'Add selected (1)' : '添加所选（1）', exact: true }).isDisabled());
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_search_engines_v1'))
      .filter(engine => engine.id === 'se-juejin').length), 1);
    await page.evaluate(() => { Storage.prototype.setItem = window.savedSetItem; });
    await page.keyboard.press('Escape');
    await page.reload();
    await open.click();
    await dialog.getByRole('searchbox').fill('juejin');
    assert.ok(await dialog.getByRole('checkbox').isDisabled());
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(`PASS ${built ? 'production' : 'development'} presets: selection, bilingual filtering, categories, quota draft retention, single batch, persistence, defaults/library, keyword conflict, uncertain retry guard, keyboard and 320/390/1280px light/dark`);
} finally {
  await browser?.close();
  if (built) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
  else await server.close();
}
