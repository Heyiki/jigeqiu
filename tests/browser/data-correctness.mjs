import assert from 'node:assert/strict';
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
    localStorage.clear();
    const manager = new StorageManager();
    const source = manager.createFolder('Source');
    manager.createFolder('Target');
    manager.saveManualBookmark({
      title: 'Move me', url: 'https://move.example/', domain: 'move.example', category: '',
      order: 0, pinnedToDesktop: false, collectionIds: [], folderId: source.id,
    });
  });
  await page.reload();
  const instrumentStorage = () => {
    const original = Storage.prototype.setItem;
    window.auditWrites = [];
    window.auditFailKey = '';
    Storage.prototype.setItem = function (key, value) {
      if (window.auditFailKey === key) throw new DOMException('Full', 'QuotaExceededError');
      window.auditWrites.push(key);
      return original.call(this, key, value);
    };
  };
  await page.addInitScript(instrumentStorage);
  await page.evaluate(instrumentStorage);
  const header = page.getByRole('banner');
  await header.getByRole('button', { name: '管理中心', exact: true }).click();
  const readLibrary = () => page.evaluate(() => JSON.parse(localStorage.getItem('jipage_library_v2')));
  const resetWrites = () => page.evaluate(() => { window.auditWrites = []; });
  const libraryWrites = () => page.evaluate(() => window.auditWrites.filter(key => key === 'jipage_library_v2').length);
  const fail = key => page.evaluate(value => { window.auditFailKey = value; }, key);

  await page.getByRole('button', { name: '新建文件夹', exact: true }).first().click();
  let dialog = page.getByRole('dialog', { name: '新建书签文件夹', exact: true });
  await dialog.getByPlaceholder('例如：常用工具、AI 助手、前端技术栈...').fill('Created once');
  await resetWrites();
  await dialog.getByRole('button', { name: '创建文件夹', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await libraryWrites(), 1, 'Standalone folder creation must persist once');

  await page.getByRole('button', { name: '新建文件夹', exact: true }).first().click();
  dialog = page.getByRole('dialog', { name: '新建书签文件夹', exact: true });
  await dialog.getByPlaceholder('例如：常用工具、AI 助手、前端技术栈...').fill('Retry folder');
  const beforeCreate = await readLibrary();
  await fail('jipage_library_v2');
  await dialog.getByRole('button', { name: '创建文件夹', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: '存储空间不足' }).waitFor();
  assert.deepEqual(await readLibrary(), beforeCreate);
  assert.equal(await dialog.getByPlaceholder('例如：常用工具、AI 助手、前端技术栈...').inputValue(), 'Retry folder');
  await fail('');
  await resetWrites();
  await dialog.getByRole('button', { name: '创建文件夹', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await libraryWrites(), 1);
  assert.equal((await readLibrary()).folders.filter(folder => folder.name === 'Retry folder').length, 1);

  await page.getByRole('button', { name: '添加收藏', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '添加收藏', exact: true });
  await dialog.getByRole('button', { name: /^收藏位置/ }).click();
  await dialog.getByRole('button', { name: '新建文件夹', exact: true }).click();
  await dialog.getByRole('textbox', { name: '新文件夹名称', exact: true }).fill('Inline once');
  await resetWrites();
  await dialog.getByRole('button', { name: '创建文件夹', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('jipage_library_v2')).folders.some(folder => folder.name === 'Inline once'));
  assert.equal(await libraryWrites(), 1, 'Inline creation must not save again through the parent callback');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();

  await page.getByPlaceholder('按名称、网址或关键词搜索...').fill('Move me');
  // Return to the complete library before selecting the bookmarked row.
  await page.getByRole('button', { name: /^全部收藏 1$/ }).click();
  const row = page.locator('[data-library-bookmark]').filter({ hasText: 'Move me' });
  await row.getByRole('checkbox').check();
  await page.getByRole('button', { name: '转移文件夹', exact: true }).click();
  dialog = page.getByRole('dialog', { name: /将 1 个书签转移至文件夹/ });
  await dialog.getByRole('button', { name: /^目标文件夹/ }).click();
  await dialog.getByRole('treeitem').filter({ hasText: 'Target' }).click();
  const beforeMove = await readLibrary();
  await fail('jipage_library_v2');
  await dialog.getByRole('button', { name: '确定转移', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: '存储空间不足' }).waitFor();
  assert.deepEqual(await readLibrary(), beforeMove);
  await fail('');
  await resetWrites();
  await dialog.getByRole('button', { name: '确定转移', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await libraryWrites(), 1);
  const afterMove = await readLibrary();
  const target = afterMove.folders.find(folder => folder.name === 'Target');
  assert.equal(afterMove.bookmarks[0].folderId, target.id);
  assert.deepEqual(target.bookmarkIds, [afterMove.bookmarks[0].id]);
  assert.deepEqual(afterMove.folders.find(folder => folder.name === 'Source').bookmarkIds, []);

  await fail('jipage_settings_v1');
  await header.getByRole('button', { name: '切换为英文', exact: true }).click();
  await page.getByText(/存储空间不足/).waitFor();
  assert.equal(await header.getByRole('button', { name: '切换为英文', exact: true }).count(), 1);
  await fail('');
  await resetWrites();
  await header.getByRole('button', { name: '切换为英文', exact: true }).click();
  await header.getByRole('button', { name: 'Switch to Chinese', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.auditWrites.filter(key => key === 'jipage_settings_v1').length), 1);
  await header.getByRole('button', { name: 'Switch to Chinese', exact: true }).click();

  const nav = page.getByRole('navigation', { name: '管理中心导航', exact: true });
  await nav.getByRole('button', { name: '搜索引擎', exact: true }).click();
  await page.getByRole('button', { name: /添加.*引擎/ }).first().click();
  dialog = page.getByRole('dialog', { name: '添加自定义搜索引擎', exact: true });
  await dialog.getByPlaceholder('例如：Stack Overflow、掘金、Google Scholar、GitHub...').fill('Saved engine');
  await dialog.getByPlaceholder('g、bd、bing、gh、so').fill('saved');
  await dialog.getByPlaceholder('https://example.com/search?q={query}').fill('https://saved.example/?q={query}');
  await fail('jipage_search_engines_v1');
  await dialog.getByRole('button', { name: '创建搜索引擎', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: '存储空间不足' }).waitFor();
  assert.equal(await dialog.getByPlaceholder('g、bd、bing、gh、so').inputValue(), 'saved');
  await fail('');
  await resetWrites();
  await dialog.getByRole('button', { name: '创建搜索引擎', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.auditWrites.filter(key => key === 'jipage_search_engines_v1').length), 1);
  await page.reload();
  assert.deepEqual(await readLibrary(), afterMove);
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_search_engines_v1'))
    .some(engine => engine.name === 'Saved engine')));
  await header.getByRole('button', { name: '管理中心', exact: true }).click();
  await nav.getByRole('button', { name: '导入与导出', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出标准 HTML 书签文件 (Chrome / Edge 适用)', exact: true }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  let html = '';
  for await (const chunk of stream) html += chunk.toString();
  const exported = await page.evaluate(text => {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    return {
      links: [...doc.querySelectorAll('a')].map(link => ({ title: link.textContent, url: link.getAttribute('href') })),
      folders: [...doc.querySelectorAll('h3')].map(heading => heading.textContent),
    };
  }, html);
  assert.deepEqual(exported.links, [{ title: 'Move me', url: 'https://move.example/' }]);
  assert.equal(exported.folders.length, afterMove.folders.length, 'HTML retains empty archive folders');
  assert.ok(exported.folders.includes('Target'));

  await nav.getByRole('button', { name: '全部收藏', exact: true }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('button', { name: '新建文件夹', exact: true }).first().click();
    dialog = page.getByRole('dialog', { name: '新建书签文件夹', exact: true });
    await dialog.getByPlaceholder('例如：常用工具、AI 助手、前端技术栈...').fill('Mobile draft');
    await fail('jipage_library_v2');
    await dialog.getByRole('button', { name: '创建文件夹', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    assert.match(await dialog.getByRole('alert').innerText(), /存储空间不足/);
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    assert.equal(await dialog.evaluate(element => element.scrollWidth > element.clientWidth), false);
    await page.screenshot({ path: `/tmp/jigeqiu-data-correctness-${width}.png`, fullPage: true });
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await fail('');
    assert.deepEqual(await readLibrary(), afterMove);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await nav.getByRole('button', { name: '导入与导出', exact: true }).click();
  // A bad legacy URL must fail explicitly, not become an executable link in a backup.
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('jipage_library_v2'));
    data.bookmarks[0].url = 'javascript:alert(1)';
    localStorage.setItem('jipage_library_v2', JSON.stringify(data));
  });
  await page.getByRole('button', { name: '导出标准 HTML 书签文件 (Chrome / Edge 适用)', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: /导出失败/ }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS management create/inline create/move: one write, quota failure preserves inputs, retry, language and engine feedback, reload, complete HTML download and unsafe export refusal');
} finally {
  await browser?.close();
  await server.close();
}
