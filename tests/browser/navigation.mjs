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
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('jipage_bookmarks_v1', JSON.stringify([{
      id: 'kept', title: 'Kept bookmark', url: 'https://example.test/', domain: 'example.test',
      category: 'legacy', order: 0, pinnedToDesktop: false, collectionIds: [], createdAt: 1, updatedAt: 1,
    }]));
    localStorage.setItem('jipage_folders_v1', '[]');
    localStorage.setItem('jipage_collections_v1', JSON.stringify([{
      id: 'local', title: 'Local toolkit', description: 'Personal collection', items: [],
      category: 'legacy', authorId: 'user-me', authorName: 'Me', visibility: 'public', createdAt: 1, updatedAt: 1,
    }]));
  });
  await page.reload();
  const header = page.getByRole('banner');
  const openManager = () => header.getByRole('button', { name: '管理中心', exact: true }).click();
  await openManager();
  await page.getByRole('heading', { name: '全部收藏', exact: true }).waitFor();
  assert.equal(await header.getByRole('button', { name: /探索|插件|添加收藏|全部收藏|设置|个人/ }).count(), 0);
  const nav = page.getByRole('navigation', { name: '管理中心导航', exact: true });
  await nav.getByRole('button', { name: '搜索引擎', exact: true }).click();
  await header.getByRole('button', { name: '桌面', exact: true }).click();
  await openManager();
  await page.getByRole('heading', { name: '搜索引擎', exact: true }).waitFor();
  assert.equal(await nav.getByRole('button', { name: '我的网址单', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '新建网址单', exact: true }).count(), 0);
  assert.equal(await page.getByText(/桌面分类定制|投稿与审核|向社区分享|分享可见性/).count(), 0);
  await mkdir('test-results/screenshots', { recursive: true });
  await page.screenshot({ path: 'test-results/screenshots/navigation-desktop.png', fullPage: true });
  const readAssets = () => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)
    .filter(([key]) => key !== 'jipage_settings_v1')));
  const assets = await readAssets();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await openManager();
    assert.equal(await page.locator('option[value="collections"]').count(), 0);
    await page.getByRole('combobox', { name: '管理中心小节', exact: true }).selectOption('appearance');
    for (const dark of [false, true]) {
      const toggle = header.getByRole('button', { name: dark ? '切换夜间模式' : '切换日间模式', exact: true });
      if (await toggle.count()) await toggle.click();
      await page.screenshot({ path: `test-results/screenshots/navigation-${width}-zh-${dark ? 'dark' : 'light'}.png`, fullPage: true });
    }
    const language = header.getByRole('button', { name: '切换为英文', exact: true });
    await language.click();
    await header.getByRole('button', { name: 'Switch to Chinese', exact: true }).waitFor();
    await page.getByRole('combobox', { name: 'Management section', exact: true }).selectOption('appearance');
    await page.getByRole('heading', { name: 'Appearance', exact: true }).waitFor();
    for (const dark of [false, true]) {
      const toggle = header.getByRole('button', { name: dark ? 'Night mode' : 'Day mode', exact: true });
      if (await toggle.count()) await toggle.click();
      const button = await header.getByRole('button', { name: 'Switch to Chinese', exact: true }).boundingBox();
      assert.ok(button.x >= 0 && button.x + button.width <= width, 'Language remains visible');
      const boxes = await header.getByRole('button').evaluateAll(buttons => buttons.map(button => {
        const { x, right } = button.getBoundingClientRect();
        return { x, right };
      }));
      for (let i = 0; i < boxes.length; i++) {
        assert.ok(boxes[i].x >= 0 && boxes[i].right <= width, 'Every top control fits');
        if (i) assert.ok(boxes[i].x >= boxes[i - 1].right, 'Top controls never overlap');
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `test-results/screenshots/navigation-${width}-${dark ? 'dark' : 'light'}.png`, fullPage: true });
    }
    await page.reload();
    await header.getByRole('button', { name: 'Switch to Chinese', exact: true }).click();
  }
  assert.deepEqual(await readAssets(), assets, 'Navigation cannot rewrite assets or legacy fields');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await header.getByRole('button', { name: '桌面', exact: true }).click();
  await page.getByRole('button', { name: /^(打开搜索|Open search)$/ }).click();
  const search = page.getByRole('dialog', { name: '全局搜索', exact: true });
  await search.getByRole('combobox').fill('Local toolkit');
  assert.equal(await search.getByRole('option').filter({ hasText: '网址单' }).count(), 0,
    'Legacy collections are not searchable in the open-source app');
  await search.getByRole('combobox').fill('计算器');
  assert.equal(await search.getByRole('option').filter({ hasText: /插件|工具|精选/ }).count(), 0);
  await search.getByRole('combobox').fill('/all');
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: '全部收藏', exact: true }).waitFor();
  await header.getByRole('button', { name: '桌面', exact: true }).click();
  await page.reload();
  await openManager();
  await page.getByRole('heading', { name: '全部收藏', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS open-source navigation/search exclude collections; session memory, commands, language, 320/390px and legacy asset preservation');
} finally { await browser?.close(); await server.close(); }
