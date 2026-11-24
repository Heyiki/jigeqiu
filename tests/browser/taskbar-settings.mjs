import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } });
  await context.route('https://**/*', route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(`${base}/#/settings/appearance`);
  const slider = page.getByRole('slider', { name: '任务栏图标大小', exact: true });
  await slider.waitFor();
  assert.equal(await page.locator('[data-testid="bottom-dock"]').count(), 0, 'Management must not mount the live desktop Taskbar');
  const preview = page.locator('[data-dock-preview]');
  const size = () => preview.locator('[data-dock-preview-icon]').first().evaluate(el => el.getBoundingClientRect().width);
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('jipage_settings_v1') ?? '{}').dockIconSize);
  const before = await saved();
  assert.equal(await size(), 48);
  await slider.focus();
  await page.keyboard.down('ArrowRight');
  assert.equal(await size(), 49);
  assert.equal(await saved(), before, 'Preview does not persist while a key is held');
  await page.keyboard.up('ArrowRight');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('jipage_settings_v1')).dockIconSize === 49);
  const bounds = await slider.boundingBox();
  await page.mouse.move(bounds.x + bounds.width * 15 / 40, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.9, bounds.y + bounds.height / 2, { steps: 5 });
  const dragged = Number(await slider.inputValue());
  assert.equal(await size(), dragged);
  assert.equal(await saved(), 49);
  await page.mouse.up();
  await page.waitForFunction(value => JSON.parse(localStorage.getItem('jipage_settings_v1')).dockIconSize === value, dragged);
  await page.getByRole('banner').getByRole('button', { name: '桌面', exact: true }).click();
  const dock = page.locator('[data-testid="bottom-dock"]');
  await dock.waitFor();
  assert.equal(await dock.getByRole('button', { name: /启动台/ }).evaluate(el => el.getBoundingClientRect().width), dragged);
  await page.goto(`${base}/#/settings/appearance`);
  await slider.waitFor();
  assert.equal(await slider.inputValue(), String(dragged));
  await page.getByRole('switch', { name: '显示任务栏', exact: true }).click();
  await slider.waitFor({ state: 'hidden' });
  assert.equal(await preview.count(), 0);
  await page.getByRole('banner').getByRole('button', { name: '桌面', exact: true }).click();
  await page.locator('[data-testid="desktop-viewport"]').waitFor();
  assert.equal(await dock.count(), 0, 'The preference still hides the Taskbar on desktop');
  await page.goto(`${base}/#/settings/appearance`);
  await page.getByRole('switch', { name: '显示任务栏', exact: true }).click();
  await slider.waitFor();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'jipage_settings_v1') throw new DOMException('full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await slider.fill('34');
  await slider.dispatchEvent('pointerup');
  await page.getByRole('alert').filter({ hasText: '任务栏设置未保存' }).waitFor();
  assert.equal(await size(), dragged, 'Failed save restores the saved preview');
  await page.reload();
  await page.getByRole('button', { name: '恢复默认大小', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('jipage_settings_v1')).dockIconSize === 48);
  assert.equal(await size(), 48);
  await page.reload();
  await slider.waitFor();
  assert.equal(await size(), 48, 'Reset persists across reload');
  for (const [width, language] of [[1440, 'zh'], [390, 'en'], [320, 'zh']]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(language => {
      const settings = JSON.parse(localStorage.getItem('jipage_settings_v1'));
      localStorage.setItem('jipage_settings_v1', JSON.stringify({ ...settings, language, dockIconSize: 74 }));
    }, language);
    await page.reload();
    await preview.waitFor();
    assert.equal(await size(), 74);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await preview.scrollIntoViewIfNeeded();
    await mkdir('/tmp/jigeqiu-taskbar-settings', { recursive: true });
    await page.screenshot({ path: `/tmp/jigeqiu-taskbar-settings/${width}-${language}.png` });
    const back = page.getByRole('button', { name: language === 'en' ? 'Back to top' : '返回顶部', exact: true });
    await back.waitFor();
    assert.equal(await back.locator('..').evaluate(el => getComputedStyle(el).bottom), '24px');
  }
  assert.deepEqual(errors, []);
  console.log('PASS taskbar only on desktop, live size preview, pointer/keyboard release save, desktop size propagation, hide/show, failed-save rollback, reset/reload, locales and narrow screens');
} finally {
  await browser?.close();
  await server.close();
}
