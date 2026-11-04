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
  await page.route('https://**/*', route => route.fulfill({ body: '' }));
  const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
  await page.goto(base);
  await page.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem('jipage_settings_v1', JSON.stringify({
      appearanceMode: 'light-glass', wallpaperPreset: 'cyan-lake', language: 'zh', showDock: true,
    }));
    localStorage.setItem('jipage_bookmarks_v1', JSON.stringify([
      'GitHub', '设计工具与资源收藏夹'.repeat(5), '文档', '工具',
    ].map((title, i) => ({
      id: `day-${i}`, title, url: `https://example.test/${i}`, domain: 'example.test',
      category: 'cat-inbox', order: i, pinnedToDesktop: true, iconMode: 'text',
      collectionIds: [], createdAt: 1, updatedAt: 1,
    }))));
    localStorage.setItem('jipage_folders_v1', '[]');
    const { StorageManager } = await import('/src/services/storage.ts');
    new StorageManager().setDesktopPins(Array.from({ length: 4 }, (_, i) => `day-${i}`), true);
  });
  await page.reload();
  await mkdir('/tmp/jigeqiu-day-labels', { recursive: true });
  const labels = page.locator('.desktop-stage .desktop-icon-label');
  await labels.first().waitFor();
  assert.equal(await labels.first().evaluate(el => getComputedStyle(el).color), 'rgb(248, 250, 252)');
  assert.notEqual(await labels.first().evaluate(el => getComputedStyle(el).textShadow), 'none');
  const brand = page.getByRole('banner').getByRole('button', { name: '记个球首页', exact: true });
  for (const name of ['记个球', 'JIGEQIU']) {
    assert.equal(await brand.getByText(name, { exact: true }).evaluate(el => getComputedStyle(el).color), 'rgb(248, 250, 252)',
      'Brand names use the light wallpaper foreground');
  }
  assert.equal(await page.getByText('我的桌面', { exact: true }).evaluate(el => getComputedStyle(el).color), 'rgb(248, 250, 252)');
  await page.getByTitle('启动台 · 所有应用与收藏 (桌面上滑亦可展开)').click();
  const launchpad = page.getByRole('dialog', { name: '启动台', exact: true });
  await launchpad.evaluate(async el => {
    await Promise.all(el.getAnimations().map(animation => animation.finished));
  });
  assert.equal(await launchpad.getByRole('heading', { name: '启动台', exact: true })
    .evaluate(el => getComputedStyle(el).color), 'rgb(248, 250, 252)');
  const letter = launchpad.locator('.launchpad-letter:enabled').first();
  assert.equal(await letter.evaluate(el => getComputedStyle(el).color), 'rgb(248, 250, 252)');
  await letter.click();
  const currentLetter = launchpad.locator('.launchpad-letter[aria-current="location"]');
  assert.equal(await currentLetter.evaluate(el => getComputedStyle(el).color), 'rgb(248, 250, 252)');
  assert.equal(await launchpad.getByRole('searchbox').evaluate(el => getComputedStyle(el).color), 'rgb(2, 6, 23)',
    'Search remains dark text on a light input');
  await page.screenshot({ path: '/tmp/jigeqiu-day-labels/launchpad-light.png' });
  await page.keyboard.press('Escape');
  const stage = page.locator('.desktop-stage');
  assert.equal(await stage.evaluate(el => getComputedStyle(el).getPropertyValue('--wallpaper-stage-wash').trim()), 'rgb(0 0 0 / 36%)');
  await page.screenshot({ path: '/tmp/jigeqiu-day-labels/desktop-light.png' });
  await labels.nth(1).hover();
  const tip = page.getByRole('tooltip');
  await tip.waitFor();
  assert.equal(await tip.evaluate(el => getComputedStyle(el).color), 'rgb(24, 32, 36)',
    'Tooltip retains dark text on its light panel');
  await page.mouse.move(0, 0);
  await page.goto(`${base}#/settings/appearance`);
  const day = page.getByRole('button', { name: '选择外观：日间模式', exact: true });
  const night = page.getByRole('button', { name: '选择外观：夜间模式', exact: true });
  await day.waitFor();
  await night.waitFor();
  assert.equal(await page.getByRole('button', { name: /降低透明度/ }).count(), 0);
  await night.click();
  assert.ok(await page.locator('html').evaluate(el => el.classList.contains('dark-glass')));
  await day.click();
  assert.ok(await page.locator('html').evaluate(el => !el.classList.contains('dark-glass')));
  await page.reload();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_settings_v1')).appearanceMode), 'light-glass');
  await page.setViewportSize({ width: 320, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/jigeqiu-day-labels/settings-320.png' });
  console.log('PASS day wallpaper labels/shadow, dark wash, tooltip contrast, two theme choices, persistence and mobile bounds');
} finally {
  await browser?.close();
  await server.close();
}
