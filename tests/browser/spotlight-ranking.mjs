import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.route('https://**/*', route => route.fulfill({ body: '' }));
  await context.addInitScript(() => {
    window.openedUrls = [];
    window.open = url => { window.openedUrls.push(String(url)); return null; };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(5000);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.evaluate(() => {
    localStorage.clear();
    const entries = [
      ['weak', 'GitHub documentation', 'https://docs.github.com/', []],
      ['github', 'GitHub', 'https://github.com/', []],
      ['figma', 'Design workspace', 'https://www.figma.com/', []],
      ['duplicate-a', 'Duplicate title', 'https://one.example.test/', []],
      ['duplicate-b', 'Duplicate title', 'https://two.example.test/', []],
      ['shared-a', 'First page', 'https://shared.com/one', []],
      ['shared-b', 'Second page', 'https://shared.com/two', []],
      ['metadata', 'Reference', 'https://reference.example.test/', ['metadata-only']],
      ['prefix', 'TypeScript handbook', 'https://typescript.example.test/', []],
      ['laravel', 'laravel 11 中文文档', 'https://docs.example.test/laravel/', []],
    ];
    localStorage.setItem('jipage_bookmarks_v1', JSON.stringify(entries.map(([id, title, url, keywords], order) => ({
      id, title, url, keywords, domain: new URL(url).hostname, category: 'cat-inbox',
      pinnedToDesktop: false, order, collectionIds: [], createdAt: 1, updatedAt: 1,
    }))));
    localStorage.setItem('jipage_folders_v1', '[]');
    localStorage.setItem('jipage_search_engines_v1', JSON.stringify([
      { id: 'google', name: 'Google', keyword: 'g', urlTemplate: 'https://www.google.com/search?q={query}', isEnabled: true },
      { id: 'duck', name: 'DuckDuckGo', keyword: 'ddg', urlTemplate: 'https://duckduckgo.com/?q={query}', isEnabled: true },
    ]));
  });
  await page.reload();
  const home = page.getByRole('search', { name: '桌面搜索', exact: true });
  const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true });
  const input = dialog.getByRole('combobox');
  const open = async query => {
    if (!await dialog.isVisible()) await home.getByRole('button', { name: /^(打开搜索|Open search)$/ }).click();
    await input.fill(query);
  };
  const selected = dialog.locator('[role="option"][aria-selected="true"]');
  const assertSelected = async id => {
    await dialog.locator(`#spotlight-result-${id}[aria-selected="true"]`).waitFor();
    assert.equal(await selected.count(), 1);
    assert.equal(await input.getAttribute('aria-activedescendant'), `spotlight-result-${id}`);
    assert.equal(await dialog.locator('#spotlight-primary-action').textContent(),
      await selected.locator('span.text-sm').textContent());
  };
  const execute = async (query, expected, button = false) => {
    await open(query);
    await (button ? dialog.getByRole('button', { name: '搜索', exact: true }).click() : input.press('Enter'));
    assert.equal(await page.evaluate(() => window.openedUrls.at(-1)), expected);
  };
  await open('GitHub');
  await assertSelected('bm-github');
  assert.equal(await dialog.getByRole('option').first().getAttribute('id'), 'spotlight-result-bm-github');
  await execute('GitHub', 'https://github.com/');
  await execute('ＧｉｔＨｕｂ', 'https://github.com/', true);
  await open('figma');
  await assertSelected('bm-figma');
  await execute('figma', 'https://www.figma.com/');
  await open('TypeScript hand');
  await assertSelected('bm-prefix');
  for (const query of ['laravel11', 'laravel 11', 'ＬＡＲＡＶＥＬ　１１']) {
    await open(query);
    await dialog.locator('#spotlight-result-bm-laravel').waitFor();
    await assertSelected('action-search-engine');
    await execute(query, `https://www.google.com/search?q=${encodeURIComponent(query)}`);
  }
  await open('laravel11中文文档');
  await assertSelected('bm-laravel');
  await execute('laravel11中文文档', 'https://docs.example.test/laravel/', true);
  for (const query of ['Duplicate title', 'shared', 'metadata-only', 'Git', 'unmatched']) {
    await open(query);
    await assertSelected('action-search-engine');
    assert.equal(await dialog.getByRole('option').first().getAttribute('id'), 'spotlight-result-action-search-engine');
    await execute(query, `https://www.google.com/search?q=${encodeURIComponent(query)}`);
  }
  await open('GitHub');
  await input.press('ArrowDown');
  await assertSelected('action-search-engine');
  await input.press('Enter');
  assert.equal(await page.evaluate(() => window.openedUrls.at(-1)), 'https://www.google.com/search?q=GitHub');
  await open('metadata-only');
  await input.press('ArrowDown');
  await assertSelected('bm-metadata');
  await input.press('Enter');
  assert.equal(await page.evaluate(() => window.openedUrls.at(-1)), 'https://reference.example.test/');
  await open('metadata-only');
  await input.press('Tab');
  await assertSelected('action-search-engine');
  await page.keyboard.press('Tab');
  await assertSelected('bm-metadata');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.openedUrls.at(-1)), 'https://reference.example.test/');
  await open('GitHub');
  await dialog.locator('#spotlight-result-bm-weak').click();
  assert.equal(await page.evaluate(() => window.openedUrls.at(-1)), 'https://docs.github.com/');
  await open('metadata-only');
  await input.press('ArrowDown');
  await input.fill('figma');
  await assertSelected('bm-figma');
  await input.fill('unmatched');
  await dialog.getByRole('button', { name: /切换搜索引擎/ }).click();
  await dialog.getByRole('button', { name: 'DuckDuckGo', exact: true }).click();
  await assertSelected('action-search-engine');
  assert.match(await selected.textContent(), /DuckDuckGo/);
  await execute('unmatched', 'https://duckduckgo.com/?q=unmatched', true);
  await execute('g GitHub', 'https://www.google.com/search?q=GitHub');
  await open('github.com');
  await assertSelected('bm-github');
  await execute('github.com', 'https://github.com/');
  await open('/help');
  await input.press('Enter');
  await page.getByRole('dialog', { name: '使用指南', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await open('figma');
  const count = await page.evaluate(() => window.openedUrls.length);
  await input.dispatchEvent('compositionstart');
  await input.dispatchEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true });
  assert.equal(await page.evaluate(() => window.openedUrls.length), count);
  await input.dispatchEvent('compositionend');
  await input.fill('');
  assert.equal(await selected.count(), 0);
  assert.equal(await dialog.getByRole('button', { name: '搜索', exact: true }).isDisabled(), true);
  await mkdir('test-results/screenshots', { recursive: true });
  for (const width of [1440, 390, 320]) {
    for (const dark of [false, true]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await page.evaluate(value => {
        document.documentElement.classList.toggle('dark', value);
        document.documentElement.classList.toggle('dark-glass', value);
      }, dark);
      await input.fill('GitHub');
      await assertSelected('bm-github');
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `test-results/screenshots/spotlight-ranking-${width}-${dark ? 'dark' : 'light'}.png` });
    }
  }
  await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('jipage_settings_v1') ?? '{}');
    localStorage.setItem('jipage_settings_v1', JSON.stringify({ ...settings, language: 'en-US' }));
  });
  await page.reload();
  await open('metadata-only');
  await assertSelected('action-search-engine');
  assert.match(await selected.textContent(), /Search .* for “metadata-only”/);
  await page.screenshot({ path: 'test-results/screenshots/spotlight-ranking-320-en.png' });
  await open('laravel11');
  await dialog.locator('#spotlight-result-bm-laravel').waitFor();
  await assertSelected('action-search-engine');
  await page.screenshot({ path: 'test-results/screenshots/spotlight-title-spaces-320-en.png' });
  assert.deepEqual(errors, []);
  console.log('PASS confidence ranking, ambiguity fallback, normalization, manual override/reset, engine/button/Enter parity, URL/command priority, IME and responsive layouts');
} finally {
  await browser?.close();
  await server.close();
}
