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
  await context.route('http://example.com/**', route => route.fulfill({ body: '' }));
  await context.addInitScript(() => {
    window.openedUrls = [];
    window.open = url => { window.openedUrls.push(String(url)); return null; };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.evaluate(() => {
    localStorage.clear();
    const entries = [
      ['home', 'Homepage', 'https://example.com/'],
      ['sibling', 'Other page', 'https://example.com/Docs/other'],
      ['docs', 'Documentation', 'http://www.example.com/Docs/'],
      ['query', 'Query and fragment', 'https://example.com/Docs/?id=A#Intro'],
      ['port', 'Development', 'https://example.com:8443/Docs/'],
      ['duplicate-a', 'Duplicate HTTP', 'http://duplicate.com/docs'],
      ['duplicate-b', 'Duplicate HTTPS', 'https://duplicate.com/docs/'],
      ['path', '/guide/install', 'https://guide.example.test/guide/install/'],
      ['custom-tld', 'Custom domain', 'https://tools.example.test/Docs/'],
      ['ali-sub', 'Workbench', 'https://devops.aliyun.com/workbench'],
      ['ali-path', 'Products', 'https://aliyun.com/product/ecs'],
      ['ali-http', 'Cloud', 'http://www.aliyun.com/'],
      ['ali-https', 'Cloud', 'https://www.aliyun.com/'],
      ['ali-weak', 'aliyun.com reference', 'https://reference.example.test/'],
    ];
    localStorage.setItem('jipage_bookmarks_v1', JSON.stringify(entries.map(([id, title, url], order) => ({
      id, title, url, domain: new URL(url).hostname, category: 'cat-inbox',
      pinnedToDesktop: false, order, collectionIds: [], keywords: [], createdAt: 1, updatedAt: 1,
    }))));
    localStorage.setItem('jipage_folders_v1', '[]');
    localStorage.setItem('jipage_search_engines_v1', JSON.stringify([
      { id: 'google', name: 'Google', keyword: 'g', urlTemplate: 'https://www.google.com/search?q={query}', isEnabled: true },
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
  const assertSelected = async id => {
    const selected = dialog.locator(`#spotlight-result-${id}[aria-selected="true"]`);
    await selected.waitFor();
    assert.equal(await dialog.locator('[role="option"][aria-selected="true"]').count(), 1);
    assert.equal(await dialog.getByRole('option').first().getAttribute('id'), `spotlight-result-${id}`,
      'Default selection is the first result');
    assert.equal(await input.getAttribute('aria-activedescendant'), `spotlight-result-${id}`);
    assert.equal(await dialog.locator('#spotlight-primary-action').textContent(),
      await selected.locator('span.text-sm').textContent());
  };
  const assertUrlOrder = async () => {
    const ids = await dialog.getByRole('option').evaluateAll(options => options.map(option => option.id));
    const directIndex = ids.indexOf('spotlight-result-action-direct-url');
    const searchIndex = ids.indexOf('spotlight-result-action-search-engine');
    const addIndex = ids.indexOf('spotlight-result-action-bookmark-url');
    const query = new URL(/^https?:\/\//i.test(await input.inputValue())
      ? await input.inputValue() : `https://${await input.inputValue()}`);
    const key = url => JSON.stringify([url.hostname.replace(/^www\./, ''), url.port,
      url.pathname.replace(/\/$/, ''), url.search, url.hash]);
    for (const row of await dialog.getByRole('option').evaluateAll(options => options
      .filter(option => option.id.startsWith('spotlight-result-bm-'))
      .map(option => ({ id: option.id, url: option.querySelector('[data-result-url]').title })))) {
      const exact = key(new URL(row.url)) === key(query);
      assert.equal(ids.indexOf(row.id) < directIndex, exact, 'Only equivalent full URLs precede direct-open');
      assert.ok(ids.indexOf(row.id) < searchIndex, 'Related bookmarks precede web search');
    }
    assert.ok(directIndex >= 0 && directIndex < searchIndex && searchIndex < addIndex,
      'URL actions follow saved bookmarks in direct-open, search, add order');
    assert.equal(addIndex, ids.length - 1, 'Add bookmark remains the final auxiliary action');
  };
  const execute = async (query, id, url, button = false) => {
    await open(query);
    await assertSelected(id);
    await assertUrlOrder();
    const count = await page.evaluate(() => window.openedUrls.length);
    await (button ? dialog.getByRole('button', { name: '搜索', exact: true }).click() : input.press('Enter'));
    assert.equal(await page.evaluate(() => window.openedUrls.length), count + 1);
    assert.equal(await page.evaluate(() => window.openedUrls.at(-1)), url);
  };
  await execute('https://EXAMPLE.com/Docs', 'bm-docs', 'http://www.example.com/Docs/');
  await execute('example.com/Docs/', 'bm-docs', 'http://www.example.com/Docs/', true);
  await execute('http://example.com', 'bm-home', 'https://example.com/');
  await execute('example.com/Docs?id=A#Intro', 'bm-query', 'https://example.com/Docs/?id=A#Intro');
  await execute('example.com:8443/Docs', 'bm-port', 'https://example.com:8443/Docs/');
  await execute('tools.example.test/Docs', 'bm-custom-tld', 'https://tools.example.test/Docs/');
  for (const query of [
    'example.com/docs', 'example.com/Docs?id=a#Intro', 'example.com/Docs?id=A#Other',
    'example.com:8444/Docs', 'unknown.example.test/new',
  ]) {
    await execute(query, 'action-direct-url', `https://${query}`);
  }
  await open('duplicate.com/docs');
  await assertSelected('bm-duplicate-a');
  await assertUrlOrder();
  assert.equal(await dialog.locator('#spotlight-result-bm-duplicate-a').count(), 1);
  assert.equal(await dialog.locator('#spotlight-result-bm-duplicate-b').count(), 1);
  await input.press('ArrowDown');
  await dialog.locator('#spotlight-result-bm-duplicate-b[aria-selected="true"]').waitFor();
  await input.press('Enter');
  assert.equal(await page.evaluate(() => window.openedUrls.at(-1)), 'https://duplicate.com/docs/');
  await open('example.com/Docs');
  assert.deepEqual(await dialog.getByRole('option').evaluateAll(options => options.map(option => option.id)), [
    'spotlight-result-bm-docs', 'spotlight-result-action-direct-url',
    'spotlight-result-bm-home', 'spotlight-result-bm-sibling', 'spotlight-result-bm-query', 'spotlight-result-bm-port',
    'spotlight-result-action-search-engine', 'spotlight-result-action-bookmark-url',
  ]);
  await dialog.locator('#spotlight-result-action-direct-url').focus();
  await input.focus();
  await input.press('Enter');
  assert.equal(await page.evaluate(() => window.openedUrls.at(-1)), 'https://example.com/Docs',
    'Manual direct-open overrides the saved bookmark URL');
  await open('example.com/docs');
  await assertSelected('action-direct-url');
  await assertUrlOrder();
  await dialog.locator('#spotlight-result-bm-docs').click();
  assert.equal(await page.evaluate(() => window.openedUrls.at(-1)), 'http://www.example.com/Docs/');
  await open('example.com/docs');
  await assertSelected('action-direct-url');
  await input.press('Tab');
  await dialog.locator('#spotlight-result-action-direct-url[aria-selected="true"]').waitFor();
  await page.keyboard.press('Tab');
  await dialog.locator('#spotlight-result-bm-home[aria-selected="true"]').waitFor();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.openedUrls.at(-1)), 'https://example.com/');
  await execute('duplicate.com/docs/', 'bm-duplicate-a', 'http://duplicate.com/docs', true);
  await open('aliyun.com');
  await assertSelected('bm-ali-http');
  assert.deepEqual(await dialog.getByRole('option').evaluateAll(options => options.map(option => option.id)), [
    'spotlight-result-bm-ali-http', 'spotlight-result-bm-ali-https', 'spotlight-result-action-direct-url',
    'spotlight-result-bm-ali-path', 'spotlight-result-bm-ali-sub', 'spotlight-result-bm-ali-weak',
    'spotlight-result-action-search-engine', 'spotlight-result-action-bookmark-url',
  ]);
  await execute('aliyun.com', 'bm-ali-http', 'http://www.aliyun.com/');
  await execute('https://www.aliyun.com/', 'bm-ali-http', 'http://www.aliyun.com/', true);
  await open('example.com/Docs');
  await input.press('ArrowDown');
  await input.fill('example.com/Docs/other');
  await assertSelected('bm-sibling');
  await open('/guide/install');
  await assertSelected('action-search-engine');
  await dialog.locator('#spotlight-result-bm-path').waitFor();
  await input.press('Enter');
  assert.equal(await page.evaluate(() => window.openedUrls.at(-1)), 'https://www.google.com/search?q=%2Fguide%2Finstall');
  await open('g example.com/Docs');
  await input.press('Enter');
  assert.equal(await page.evaluate(() => window.openedUrls.at(-1)), 'https://www.google.com/search?q=example.com%2FDocs');
  await open('/help');
  await input.press('Enter');
  await page.getByRole('dialog', { name: '使用指南', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await open('example.com/Docs');
  const beforeComposition = await page.evaluate(() => window.openedUrls.length);
  await input.dispatchEvent('compositionstart');
  await input.dispatchEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true });
  assert.equal(await page.evaluate(() => window.openedUrls.length), beforeComposition);
  await input.dispatchEvent('compositionend');
  await mkdir('test-results/screenshots', { recursive: true });
  for (const width of [1440, 390, 320]) {
    for (const dark of [false, true]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await page.evaluate(value => {
        document.documentElement.classList.toggle('dark', value);
        document.documentElement.classList.toggle('dark-glass', value);
      }, dark);
      await open('https://EXAMPLE.com/Docs');
      await assertSelected('bm-docs');
      await assertUrlOrder();
      await page.waitForTimeout(300);
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `test-results/screenshots/spotlight-url-ranking-${width}-${dark ? 'dark' : 'light'}.png` });
      await open('example.com/docs');
      await assertSelected('action-direct-url');
      await assertUrlOrder();
      await page.screenshot({ path: `test-results/screenshots/spotlight-url-order-${width}-${dark ? 'dark' : 'light'}-weak.png` });
      await open('aliyun.com');
      await assertSelected('bm-ali-http');
      await assertUrlOrder();
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `test-results/screenshots/spotlight-url-tiers-${width}-${dark ? 'dark' : 'light'}.png` });
    }
  }
  await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('jipage_settings_v1') ?? '{}');
    localStorage.setItem('jipage_settings_v1', JSON.stringify({ ...settings, language: 'en-US' }));
  });
  await page.reload();
  await open('example.com/Docs?id=A#Intro');
  await assertSelected('bm-query');
  await assertUrlOrder();
  await page.screenshot({ path: 'test-results/screenshots/spotlight-url-ranking-320-en.png' });
  assert.deepEqual(errors, []);
  console.log('PASS exact/direct/same-host/subdomain/weak URL tiers, equivalent duplicate first selection, URL normalization, direct fallback, keyboard/Tab/mouse override, commands, IME, responsive and English layouts');
} finally {
  await browser?.close();
  await server.close();
}
