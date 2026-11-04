import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const production = process.env.TEST_BUILD === 'true';
const server = production
  ? await preview({ preview: { host: '127.0.0.1', port: 0 } })
  : await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  if (!production) await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.route('https://**/*', route => route.fulfill({ body: '' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await mkdir('/tmp/jigeqiu-materials', { recursive: true });
  const material = locator => locator.evaluate(el => {
    const s = getComputedStyle(el);
    return { background: s.backgroundColor, border: s.borderColor, blur: s.backdropFilter, shadow: s.boxShadow };
  });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    for (const mode of ['light-glass', 'dark-glass', 'reduced-transparency']) {
      await page.evaluate(mode => {
        localStorage.clear();
        localStorage.setItem('jipage_bookmarks_v1', '[]');
        localStorage.setItem('jipage_folders_v1', '[]');
        localStorage.setItem('jipage_settings_v1', JSON.stringify({
          language: 'zh', showDock: true, appearanceMode: mode, wallpaperPreset: 'cyan-lake',
        }));
      }, mode);
      await page.reload();
      await page.locator('[role="search"] .liquid-glass').evaluate(async el => {
        await Promise.all(el.getAnimations().map(animation => animation.finished));
      });
      const baseline = await material(page.locator('[role="search"] .liquid-glass'));
      const reduced = mode === 'reduced-transparency';
      assert.equal(baseline.blur, reduced ? 'none' : 'blur(14px) saturate(1.1)',
        'Shared glass retains its standard backdrop-filter in the built CSS');
      const capture = name => page.screenshot({ path: `/tmp/jigeqiu-materials/${width}-${mode}-${name}.png` });
      await capture('desktop');
      for (const name of ['guide', 'search', 'add']) {
        if (name === 'guide') await page.getByRole('button', { name: '使用指南', exact: true }).click();
        if (name === 'search') await page.getByRole('button', { name: /^(打开搜索|Open search)$/ }).click();
        if (name === 'add') {
          await page.keyboard.press('Control+Shift+Enter');
        }
        const panel = page.getByRole('dialog').last();
        await panel.waitFor();
        assert.deepEqual(await material(panel), baseline, `${name} matches desktop material in ${mode} at ${width}px`);
        const backdrop = page.locator('.desktop-dialog-backdrop').last();
        await backdrop.waitFor({ state: 'attached' });
        const scrim = await material(backdrop);
        assert.equal(scrim.background, reduced ? 'rgb(239, 244, 242)' : 'rgba(0, 0, 0, 0)',
          `${name} does not add a second wallpaper tint`);
        assert.equal(scrim.blur, reduced ? 'none' : 'blur(4px)');
        if (!reduced && width === 1440 && name === 'search') {
          assert.match((await material(panel.locator('.spotlight-submit'))).blur, /blur\(16px\)/);
        }
        const bounds = await panel.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
        await capture(name);
        await page.keyboard.press('Escape');
        await panel.waitFor({ state: 'hidden' });
        assert.deepEqual(await material(page.locator('[role="search"] .liquid-glass')), baseline);
      }
      await page.keyboard.press('Control+Shift+Space');
      const launchpad = page.locator('.launchpad-shell');
      await launchpad.waitFor();
      assert.equal(await launchpad.evaluate(el => getComputedStyle(el, '::before').filter), 'none');
      await capture('launchpad');
      await page.keyboard.press('Escape');
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS desktop/search/add/guide shared material and tint-free scrims, launchpad wallpaper, day/night/reduced, 1440/390/320px');
} finally {
  await browser?.close();
  if (production) await new Promise(resolve => server.httpServer.close(resolve));
  else await server.close();
}
