import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.route('https://**/*', route => route.fulfill({ body: '' }));
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(url);
  await mkdir('/tmp/jigeqiu-launchpad-mark', { recursive: true });
  const colors = [];
  for (const width of [1440, 390]) {
    for (const size of [34, 48, 74]) {
      for (const dark of [false, true]) {
        await page.evaluate(({ size, dark }) => {
          localStorage.setItem('jipage_settings_v1', JSON.stringify({
            appearanceMode: dark ? 'dark-glass' : 'light-glass',
            wallpaperPreset: 'cyan-lake', language: 'zh', showDock: true,
            dockIconSize: size, dockMagnification: false,
          }));
        }, { size, dark });
        await page.setViewportSize({ width, height: 900 });
        await page.reload();
        const trigger = page.getByTitle('启动台 · 所有应用与收藏 (桌面上滑亦可展开)');
        const mark = trigger.locator('.launchpad-dot-mark');
        await mark.waitFor();
        assert.equal(await mark.locator('.launchpad-mark-dot').count(), 9);
        assert.equal(await trigger.locator('svg').count(), 0);
        const metrics = await mark.evaluate(el => {
          const box = el.getBoundingClientRect();
          const dots = [...el.children].map(dot => {
            const rect = dot.getBoundingClientRect();
            return { width: rect.width, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
              color: getComputedStyle(dot).backgroundColor };
          });
          return { box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom }, dots };
        });
        for (const dot of metrics.dots) {
          assert.ok(dot.width >= 3, 'Dots remain legible at minimum Dock size');
          assert.ok(dot.left >= metrics.box.left - 1 && dot.right <= metrics.box.right + 1);
          assert.ok(dot.top >= metrics.box.top - 1 && dot.bottom <= metrics.box.bottom + 1);
        }
        assert.ok(metrics.dots[4].width > metrics.dots[0].width, 'Center dot is subtly larger');
        assert.equal(new Set(metrics.dots.map(dot => dot.color)).size, 4);
        if (width === 1440 && size === 48) colors.push(metrics.dots[0].color);
        await trigger.screenshot({ path: `/tmp/jigeqiu-launchpad-mark/dock-${width}-${size}-${dark ? 'dark' : 'light'}.png` });
        await trigger.click();
        const dialog = page.getByRole('dialog', { name: '启动台', exact: true });
        await dialog.waitFor();
        assert.equal(await dialog.locator('header .launchpad-dot-mark .launchpad-mark-dot').count(), 9);
        if (size === 48) {
          await dialog.locator('header').screenshot({ path: `/tmp/jigeqiu-launchpad-mark/header-${width}-${dark ? 'dark' : 'light'}.png` });
        }
        await page.getByRole('button', { name: '关闭启动台', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
      }
    }
  }
  assert.notEqual(colors[0], colors[1], 'Night uses a brighter palette');
  console.log('PASS shared nine-dot mark, four colors, theme palette, 34/48/74px Dock sizes, desktop/mobile bounds and opening/closing');
} finally {
  await browser?.close();
  await server.close();
}
