import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.fulfill({ body: '' }));
  const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
  await page.goto(base);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('jipage_settings_v1', JSON.stringify({
      wallpaperPreset: 'green-lake', appearanceMode: 'light-glass', language: 'zh',
    }));
  });
  await page.goto(`${base}#/settings/appearance`);
  await page.reload();
  await page.getByRole('button', { name: '选择壁纸：青山映湖', exact: true }).waitFor();
  const gradient = page.getByRole('button', { name: '渐变', exact: true });
  assert.equal(await gradient.count(), 1, 'Desktop background offers a gradient type');
  await gradient.click();
  const canvas = page.locator('[data-wallpaper-canvas]');
  const image = () => canvas.evaluate(el => getComputedStyle(el).backgroundImage);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-wallpaper-canvas]')).backgroundImage.startsWith('linear-gradient'));
  assert.equal(await page.getByRole('button', { name: /^选择渐变：/ }).count(), 2);
  const first = await image();
  await page.getByRole('button', { name: '选择渐变：暮霞', exact: true }).click();
  await page.waitForFunction(previous => getComputedStyle(document.querySelector('[data-wallpaper-canvas]')).backgroundImage !== previous, first);
  await page.getByText('自定义渐变', { exact: true }).click();
  await page.getByLabel('起始颜色', { exact: true }).fill('#123456');
  await page.getByLabel('结束颜色', { exact: true }).fill('#654321');
  await page.getByLabel('渐变方向', { exact: true }).selectOption('90');
  await page.waitForFunction(() => {
    const value = getComputedStyle(document.querySelector('[data-wallpaper-canvas]')).backgroundImage;
    return value === 'linear-gradient(90deg, rgb(18, 52, 86), rgb(101, 67, 33))';
  });
  await page.reload();
  await gradient.waitFor();
  assert.equal(await gradient.getAttribute('aria-pressed'), 'true');
  assert.equal(await image(), 'linear-gradient(90deg, rgb(18, 52, 86), rgb(101, 67, 33))');
  await page.getByRole('button', { name: '壁纸', exact: true }).click();
  await page.getByRole('button', { name: '选择壁纸：青山映湖', exact: true }).waitFor();
  assert.match(await image(), /green-lake/);
  await gradient.click();
  assert.equal(await image(), 'linear-gradient(90deg, rgb(18, 52, 86), rgb(101, 67, 33))');
  await page.getByText('自定义渐变', { exact: true }).click();
  await mkdir('/tmp/jigeqiu-gradient', { recursive: true });
  for (const dark of [false, true]) {
    await page.getByRole('button', { name: `选择外观：${dark ? '夜间模式' : '日间模式'}`, exact: true }).click();
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 960 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `/tmp/jigeqiu-gradient/settings-${dark}-${width}.png`, fullPage: true });
    }
  }
  await page.getByRole('button', { name: '切换为英文', exact: true }).click();
  await page.getByRole('button', { name: 'Gradient', exact: true }).waitFor();
  await page.getByLabel('Start color', { exact: true }).waitFor();
  await page.getByLabel('Gradient direction', { exact: true }).waitFor();
  await page.goto(`${base}#/`);
  await page.screenshot({ path: '/tmp/jigeqiu-gradient/desktop.png' });
  assert.deepEqual(errors, []);
  console.log('PASS two gradient presets, live custom colors/direction, persistence, wallpaper memory, locales and mobile');
} finally {
  await browser?.close();
  await server.close();
}
