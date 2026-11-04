import assert from 'node:assert/strict';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route('https://**/*', route => route.fulfill({ body: '' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem('jipage_settings_v1', JSON.stringify({
      appearanceMode: 'light-glass', language: 'zh', wallpaperPreset: 'cyan-lake',
    }));
    localStorage.setItem('jipage_folders_v1', '[]');
    localStorage.setItem('jipage_bookmarks_v1', JSON.stringify(Array.from({ length: 100 }, (_, i) => ({
      id: `pagination-${i}`, title: `Site ${i}`, url: `https://example.test/${i}`, domain: 'example.test',
      category: 'cat-inbox', order: i, pinnedToDesktop: true, iconMode: 'text',
      collectionIds: [], createdAt: 1, updatedAt: 1,
    }))));
    const { StorageManager } = await import('/src/services/storage.ts');
    new StorageManager().setDesktopPins(Array.from({ length: 100 }, (_, i) => `pagination-${i}`), true);
  });
  await page.reload();
  const pagination = page.getByRole('navigation', { name: '桌面分页', exact: true });
  await pagination.waitFor();
  assert.equal(await pagination.evaluate(el => getComputedStyle(el).color), 'rgb(248, 250, 252)');
  assert.equal(await pagination.getByTitle('下一页', { exact: true }).evaluate(el => getComputedStyle(el).color), 'rgb(248, 250, 252)');
  assert.equal(await pagination.locator('[aria-current] span').evaluate(el => getComputedStyle(el).opacity), '1');
  assert.equal(await pagination.locator('button[aria-label]:not([aria-current]) span').first()
    .evaluate(el => getComputedStyle(el).opacity), '0.4');
  await pagination.getByTitle('下一页', { exact: true }).click();
  await pagination.getByRole('button', { name: '第 2 屏', exact: true })
    .and(page.locator('[aria-current="page"]')).waitFor();
  await pagination.getByTitle('上一页', { exact: true }).click();
  await pagination.getByRole('button', { name: '第 1 屏', exact: true })
    .and(page.locator('[aria-current="page"]')).waitFor();
  console.log('PASS light pagination arrows/count/dots, active distinction and previous/next navigation');
} finally {
  await browser?.close();
  await server.close();
}
