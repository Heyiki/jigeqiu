import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { once } from 'node:events';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
// Only serve built files; no Vite transformations or application API.
const root = resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp' };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : decodeURIComponent(pathname)}`);
    if (!path.startsWith(root + sep) || request.method !== 'GET') {
      response.writeHead(403).end(); return;
    }
    const bytes = await readFile(path);
    response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' }).end(bytes);
  } catch { response.writeHead(404).end(); }
});
let browser;
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const imageKeys = () => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('jigeqiu-wallpapers-v1', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('images', 'readonly');
        const request = tx.objectStore('images').getAllKeys();
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/#/settings/appearance`);
  await page.getByLabel('选择本地图片', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /选择.*壁纸/ }).count(), 2);
  const before = await page.evaluate(() => localStorage.getItem('jipage_library_v2'));
  for (const preset of ['arch-sky', 'coastal-dusk', 'botanic-sage']) {
    await page.evaluate(value => localStorage.setItem('jipage_settings_v1', JSON.stringify({
      ...JSON.parse(localStorage.getItem('jipage_settings_v1') ?? '{}'), wallpaperPreset: value,
    })), preset);
    await page.reload();
    assert.equal(await page.locator('.wallpaper-root').getAttribute('data-wallpaper'), 'cyan-lake');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_settings_v1')).wallpaperPreset), preset);
  }
  const png = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800; canvas.height = 600;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#19a59c'; ctx.fillRect(0, 0, 400, 600);
    ctx.fillStyle = '#d94769'; ctx.fillRect(400, 0, 400, 600);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const input = page.getByLabel('选择本地图片', { exact: true });
  await input.setInputFiles({ name: 'custom.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-wallpaper-canvas]')).backgroundImage.includes('blob:'));
  const firstId = await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_settings_v1')).customWallpaperId);
  await page.reload();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-wallpaper-canvas]')).backgroundImage.includes('blob:'));
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_settings_v1')).customWallpaperId), firstId);
  const pixels = await page.evaluate(async () => {
    const image = new Image();
    image.src = getComputedStyle(document.querySelector('[data-wallpaper-canvas]')).backgroundImage.match(/url\("(.+)"\)/)[1];
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 800; canvas.height = 600;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    return [Array.from(ctx.getImageData(100, 100, 1, 1).data), Array.from(ctx.getImageData(700, 100, 1, 1).data)];
  });
  assert.deepEqual(pixels, [[25, 165, 156, 255], [217, 71, 105, 255]]);
  await input.setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await page.getByRole('alert').waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_settings_v1')).customWallpaperId), firstId);
  await page.reload();
  await page.getByLabel('选择本地图片', { exact: true }).waitFor();
  await page.evaluate(() => {
    window.wallpaperOriginalOpen = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function () { throw new DOMException('Unavailable', 'SecurityError'); };
  });
  await input.setInputFiles({ name: 'unavailable.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.getByRole('alert').waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_settings_v1')).customWallpaperId), firstId);
  await page.evaluate(() => { IDBFactory.prototype.open = window.wallpaperOriginalOpen; });
  await page.reload();
  await page.getByLabel('选择本地图片', { exact: true }).waitFor();
  await page.evaluate(() => {
    window.wallpaperOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'jipage_settings_v1') throw new DOMException('Full', 'QuotaExceededError');
      return window.wallpaperOriginalSetItem.call(this, key, value);
    };
  });
  await input.setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.getByText('图片未保存，请检查格式、大小或浏览器存储空间后重试。', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_settings_v1')).customWallpaperId), firstId);
  assert.deepEqual(await imageKeys(), [firstId], 'Failed preference save removes the new image, retaining the original');
  await page.evaluate(() => { Storage.prototype.setItem = window.wallpaperOriginalSetItem; });
  await page.getByRole('button', { name: '选择壁纸：湖泊远山', exact: true }).click();
  await page.getByRole('button', { name: '使用已保存的图片', exact: true }).click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-wallpaper-canvas]')).backgroundImage.includes('blob:'));
  await page.getByRole('banner').getByRole('button', { name: '桌面', exact: true }).click();
  await page.getByTitle('启动台 · 所有应用与收藏 (桌面上滑亦可展开)').click();
  const launchpad = page.getByRole('dialog', { name: '启动台', exact: true });
  await launchpad.waitFor();
  assert.ok(await launchpad.evaluate(el => getComputedStyle(el, '::before').backgroundImage.includes('blob:')));
  await page.keyboard.press('Escape');
  await page.goto(`${origin}/#/settings/appearance`);
  await page.getByLabel('选择本地图片', { exact: true }).waitFor();
  await page.getByRole('button', { name: '选择外观：夜间模式', exact: true }).click();
  await page.getByRole('button', { name: '切换为英文', exact: true }).click();
  await page.getByLabel('Choose local image', { exact: true }).waitFor();
  await page.screenshot({ path: '/tmp/custom-wallpaper-desktop-dark-en.png', fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `/tmp/custom-wallpaper-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Switch to Chinese', exact: true }).click();
  await page.getByRole('button', { name: '移除自定义图片', exact: true }).click();
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem('jipage_settings_v1')).customWallpaperId);
  const cleanupDeadline = Date.now() + 5000;
  while ((await imageKeys()).length && Date.now() < cleanupDeadline) await new Promise(resolve => setTimeout(resolve, 25));
  assert.deepEqual(await imageKeys(), [], 'Removing the custom image deletes its stored Blob');
  await page.reload();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_settings_v1')).wallpaperPreset), 'cyan-lake');
  assert.equal(await page.evaluate(() => localStorage.getItem('jipage_library_v2')), before);
  assert.deepEqual(errors, []);
  console.log('PASS dist-only: legacy fallback, local wallpaper upload/reload/pixels, invalid decode, unavailable IDB, preference quota rollback, built-in switch/reuse/remove, launchpad, 320/390px, assets untouched');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
