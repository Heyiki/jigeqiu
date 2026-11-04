import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
let staticServer;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.route('https://**/*', route => route.fulfill({ body: '' }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
  await page.goto(`${base}#/settings/appearance`);
  await page.getByRole('heading', { name: '外观', exact: true }).waitFor();
  assert.equal(await page.title(), '外观设置 · 记个球');
  await page.reload();
  await page.getByRole('heading', { name: '外观', exact: true }).waitFor();
  const nav = page.getByRole('navigation', { name: '管理中心导航', exact: true });
  const header = page.getByRole('banner');
  await mkdir('/tmp/jigeqiu-branding', { recursive: true });
  const brand = header.getByRole('button', { name: '记个球首页', exact: true });
  assert.equal(await brand.locator('span').first().textContent(), '记');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (width === 1440) {
      await brand.getByText('记个球', { exact: true }).waitFor({ state: 'visible' });
      await brand.getByText('JIGEQIU', { exact: true }).waitFor({ state: 'visible' });
    }
    await page.screenshot({ path: `/tmp/jigeqiu-branding/appearance-zh-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await nav.getByRole('button', { name: '全部收藏', exact: true }).click();
  await page.waitForURL('**/#/library');
  await header.getByRole('button', { name: '桌面', exact: true }).click();
  await page.waitForURL('**/#/');
  await page.goBack();
  await page.getByRole('heading', { name: '全部收藏', exact: true }).waitFor();
  await page.goBack();
  await page.getByRole('heading', { name: '外观', exact: true }).waitFor();
  await page.goForward();
  await page.getByRole('heading', { name: '全部收藏', exact: true }).waitFor();
  const length = await page.evaluate(() => history.length);
  await nav.getByRole('button', { name: '全部收藏', exact: true }).click();
  assert.equal(await page.evaluate(() => history.length), length, 'Repeated destination does not duplicate history');
  await header.getByRole('button', { name: '桌面', exact: true }).click();
  await header.getByRole('button', { name: '管理中心', exact: true }).click();
  await page.waitForURL('**/#/library');
  for (const [hash, name] of [
    ['#/settings/search-engines', '搜索引擎'],
    ['#/settings/import-export', '导入与导出'],
    ['#/trash', '回收站'],
  ]) {
    await page.goto(`${base}${hash}`);
    await page.getByRole('heading', { name, exact: true, level: 1 }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name, exact: true, level: 1 }).waitFor();
  }
  await page.goto(`${base}?test=keep#/settings/appearance`);
  await header.getByRole('button', { name: '切换为英文', exact: true }).click();
  await page.waitForFunction(() => document.title === 'Appearance · JIGEQIU');
  await header.getByRole('button', { name: 'JIGEQIU home', exact: true }).waitFor();
  assert.equal(new URL(page.url()).hash, '#/settings/appearance');
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole('combobox', { name: 'Management section', exact: true }).selectOption('engines');
  await page.waitForURL(url => url.hash === '#/settings/search-engines');
  assert.equal(new URL(page.url()).search, '?test=keep');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.goto(`${base}#/unknown-page`);
  await page.waitForURL('**/#/');
  await page.goto(base);
  await page.waitForURL('**/#/');
  await page.getByRole('button', { name: 'Night mode', exact: true }).waitFor();
  const before = page.url();
  await page.getByRole('button', { name: /^(打开搜索|Open search)$/ }).click();
  await page.getByRole('dialog', { name: /全局搜索|Global Search/ }).waitFor();
  assert.equal(page.url(), before, 'Temporary panels do not change routes');
  await page.keyboard.press('Escape');
  await page.goto(`${base}?test=keep#/start`);
  const launchpad = page.locator('[data-panel="launchpad"]');
  await launchpad.waitFor();
  assert.equal(await page.title(), 'Launchpad · JIGEQIU');
  await page.reload();
  await launchpad.waitFor();
  await page.keyboard.press('Escape');
  await page.waitForURL(url => url.hash === '#/' && url.search === '?test=keep');
  // Use the public taskbar entry rather than relying on platform-specific shortcuts.
  await page.getByRole('button', { name: /启动台|Launchpad/, exact: true }).click();
  await launchpad.waitFor();
  await page.waitForURL(url => url.hash === '#/start');
  const launchLength = await page.evaluate(() => history.length);
  await page.goBack();
  await page.waitForURL(url => url.hash === '#/');
  await launchpad.waitFor({ state: 'detached' });
  await page.goForward();
  await launchpad.waitFor();
  await page.reload();
  await launchpad.waitFor();
  assert.equal(await page.evaluate(() => history.length), launchLength);
  await page.keyboard.press('Escape');
  await page.waitForURL(url => url.hash === '#/');
  await page.keyboard.press('Control+Shift+Space');
  await launchpad.waitFor();
  await page.waitForURL(url => url.hash === '#/start');
  const repeatedLength = await page.evaluate(() => history.length);
  await page.keyboard.press('Control+Shift+Space');
  assert.equal(await page.evaluate(() => history.length), repeatedLength);
  await page.keyboard.press('Control+k');
  await page.waitForURL(url => url.hash === '#/');
  await page.locator('[data-panel="search"]').waitFor();
  await page.locator('[data-panel="search"] input').first().fill('/start');
  await page.keyboard.press('Enter');
  await launchpad.waitFor();
  await page.waitForURL(url => url.hash === '#/start');
  assert.equal(await page.locator('[data-panel="search"]').count(), 0);
  await page.getByRole('button', { name: 'Close launchpad', exact: true }).click();
  await page.waitForURL(url => url.hash === '#/');
  await page.goForward();
  await launchpad.waitFor();
  await page.keyboard.press('Escape');
  await page.waitForURL(url => url.hash === '#/');
  // Deliberately omit SPA fallback: hash routes must work on a plain file host.
  const root = resolve('dist');
  staticServer = createHttpServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(`${root}${sep}`)) { response.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      response.setHeader('Content-Type', {
        '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
      }[extname(file)] ?? 'application/octet-stream');
      response.end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => staticServer.listen(0, '127.0.0.1', resolve));
  await page.goto(`http://127.0.0.1:${staticServer.address().port}/#/settings/appearance`);
  await page.getByRole('heading', { name: '外观', exact: true, level: 1 }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: '外观', exact: true, level: 1 }).waitFor();
  await page.goto(`http://127.0.0.1:${staticServer.address().port}/#/start`);
  await launchpad.waitFor();
  await page.reload();
  await launchpad.waitFor();
  assert.equal(await page.title(), '启动台 · 记个球');
  assert.deepEqual(errors, []);
  console.log('PASS hash routes: direct load/reload, history, session memory, title/language, mobile, unknown fallback, transient panels and production static hosting');
} finally {
  await browser?.close();
  await server.close();
  if (staticServer) await new Promise(resolve => staticServer.close(resolve));
}
