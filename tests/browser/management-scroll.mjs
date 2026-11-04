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
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.fulfill({ body: '' }));
  const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
  await mkdir('/tmp/jigeqiu-management-scroll', { recursive: true });
  for (const width of [1440, 390, 320]) {
    for (const dark of [false, true]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(base);
      await page.evaluate(dark => {
        localStorage.setItem('jipage_settings_v1', JSON.stringify({
          appearanceMode: dark ? 'dark-glass' : 'light-glass', language: 'zh',
          showDock: true, dockIconSize: 74,
        }));
      }, dark);
      await page.goto(`${base}#/settings/appearance`);
      await page.reload();
      await page.getByRole('heading', { name: '外观', exact: true, level: 1 }).waitFor();
      const button = page.getByRole('button', { name: '返回顶部', exact: true });
      assert.equal(await button.count(), 0, 'Hidden near top and absent from accessibility tree');
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement, '::-webkit-scrollbar').width), '9px');
      // Ensure enough scroll range regardless of the current settings content.
      await page.locator('.management-content').evaluate(el => { el.style.minHeight = '2400px'; });
      await page.evaluate(() => window.scrollTo(0, 300));
      assert.equal(await button.count(), 0);
      await page.evaluate(() => window.scrollTo(0, 600));
      await button.waitFor();
      const box = await button.boundingBox();
      assert.equal(box.width, 40);
      assert.equal(box.height, 40);
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      assert.ok(box.y + box.height < 844 - 100, 'Clears the large Dock on mobile and desktop');
      await button.hover();
      await page.getByRole('tooltip', { name: '返回顶部', exact: true }).waitFor();
      await page.screenshot({ path: `/tmp/jigeqiu-management-scroll/${width}-${dark ? 'dark' : 'light'}.png` });
      await button.click();
      await page.waitForFunction(() => window.scrollY === 0);
      assert.equal(await button.count(), 0);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(() => window.scrollTo(0, 700));
      await button.waitFor();
      await button.focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.scrollY === 0);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.evaluate(() => { window.location.hash = '#/'; });
      await page.waitForFunction(() => !document.documentElement.classList.contains('management-scroll'));
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement, '::-webkit-scrollbar').width), '6px');
      assert.equal(await button.count(), 0);
    }
  }
  await page.evaluate(() => {
    localStorage.setItem('jipage_settings_v1', JSON.stringify({
      language: 'en', appearanceMode: 'light-glass', showDock: false,
    }));
  });
  await page.goto(`${base}#/settings/appearance`);
  await page.reload();
  await page.getByRole('heading', { name: 'Appearance', level: 1, exact: true }).waitFor();
  await page.locator('.management-content').evaluate(el => { el.style.minHeight = '2400px'; });
  await page.evaluate(() => window.scrollTo(0, 600));
  const english = page.getByRole('button', { name: 'Back to top', exact: true });
  await english.waitFor();
  assert.equal(await english.evaluate(el => getComputedStyle(el.parentElement).bottom), '24px',
    'Without Dock the button returns to the lower corner');
  assert.deepEqual(errors, []);
  console.log('PASS management scrollbar 9px only, threshold, tooltip, return/keyboard, reduced motion, day/night, Dock clearance and 320/390px');
} finally {
  await browser?.close();
  await server.close();
}
