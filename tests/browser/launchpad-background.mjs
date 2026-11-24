import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } });
  await context.route('https://**/*', route => route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(`${base}/#/settings/appearance`);
  await page.getByRole('button', { name: '选择壁纸：青山映湖', exact: true }).waitFor();
  const slider = page.getByRole('slider', { name: '启动台背景模糊', exact: true });
  assert.equal(await slider.count(), 1, 'Appearance settings provide the launchpad blur slider');
  assert.equal(await slider.inputValue(), '12');
  const preview = page.locator('[data-launchpad-preview]');
  const filter = locator => locator.evaluate(el => getComputedStyle(el, '::before').filter);
  assert.equal(await filter(preview), 'blur(12px)');
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('jipage_settings_v1') ?? '{}').launchpadBackgroundBlur);
  const before = await saved();
  await slider.focus();
  await page.keyboard.down('ArrowRight');
  assert.equal(await filter(preview), 'blur(13px)');
  assert.equal(await saved(), before, 'Keyboard preview must not save before key release');
  await page.keyboard.up('ArrowRight');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('jipage_settings_v1')).launchpadBackgroundBlur === 13);
  const bounds = await slider.boundingBox();
  await page.mouse.move(bounds.x + bounds.width * 13 / 30, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.8, bounds.y + bounds.height / 2, { steps: 5 });
  const dragged = Number(await slider.inputValue());
  assert.ok(dragged > 20);
  assert.equal(await filter(preview), `blur(${dragged}px)`);
  assert.equal(await saved(), 13, 'Pointer preview must not save before release');
  await page.mouse.up();
  await page.waitForFunction(value => JSON.parse(localStorage.getItem('jipage_settings_v1')).launchpadBackgroundBlur === value, dragged);
  const other = await context.newPage();
  await other.goto(`${base}/#/start`);
  const launchpad = other.locator('[data-panel="launchpad"]');
  await launchpad.waitFor();
  assert.equal(await filter(launchpad), `blur(${dragged}px)`);
  assert.equal(await launchpad.evaluate(el => getComputedStyle(el).filter), 'none');
  assert.equal(await other.locator('[data-wallpaper-canvas]').evaluate(el => getComputedStyle(el).filter), 'none');
  for (const current of [page, other]) {
    await current.evaluate(() => document.documentElement.classList.add('reduced-transparency'));
  }
  const overlay = locator => locator.evaluate(el => {
    const style = getComputedStyle(el, '::after');
    return { image: style.backgroundImage, color: style.backgroundColor };
  });
  assert.deepEqual(await overlay(preview), await overlay(launchpad), 'Reduced-transparency preview matches the actual Launchpad');
  for (const current of [page, other]) {
    await current.evaluate(() => document.documentElement.classList.remove('reduced-transparency'));
  }
  await slider.fill('0');
  await slider.dispatchEvent('pointerup');
  await other.waitForFunction(() => getComputedStyle(document.querySelector('[data-panel="launchpad"]'), '::before').filter === 'blur(0px)');
  await page.reload();
  await slider.waitFor();
  assert.equal(await slider.inputValue(), '0');
  await page.getByRole('button', { name: '恢复默认模糊', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('jipage_settings_v1')).launchpadBackgroundBlur === 12);
  assert.equal(await slider.inputValue(), '12');
  // A failed write must restore the persisted preview and offer an error.
  await page.evaluate(() => {
    window.originalSettingsSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'jipage_settings_v1') throw new DOMException('full', 'QuotaExceededError');
      return window.originalSettingsSet.call(this, key, value);
    };
  });
  await slider.fill('27');
  await slider.dispatchEvent('pointerup');
  await page.getByRole('alert').filter({ hasText: '启动台设置未保存' }).waitFor();
  assert.equal(await slider.inputValue(), '12');
  assert.equal(await filter(preview), 'blur(12px)');
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSettingsSet; });
  for (const [width, language] of [[1440, 'zh'], [390, 'en'], [320, 'zh']]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(language => {
      const saved = JSON.parse(localStorage.getItem('jipage_settings_v1'));
      localStorage.setItem('jipage_settings_v1', JSON.stringify({ ...saved, language }));
    }, language);
    await page.reload();
    await page.getByRole('slider', { name: language === 'en' ? 'Launchpad background blur' : '启动台背景模糊', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await mkdir('/tmp/jigeqiu-launchpad-background', { recursive: true });
    await page.screenshot({ path: `/tmp/jigeqiu-launchpad-background/settings-${width}-${language}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log('PASS launchpad blur defaults, live preview, pointer/keyboard commit, zero/reload/reset, cross-tab, failed writes, locales and narrow layouts');
} finally {
  await browser?.close();
  await server.close();
}
