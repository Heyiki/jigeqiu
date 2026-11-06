import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true });
try {
  await mkdir('/tmp/jigeqiu-favicon', { recursive: true });
  for (const mode of ['development', 'production']) {
    const server = mode === 'development'
      ? await createServer({ server: { host: '127.0.0.1', port: 0 } })
      : await preview({ preview: { host: '127.0.0.1', port: 0 } });
    if (mode === 'development') await server.listen();
    const page = await browser.newPage();
    try {
      await page.route('https://**/*', route => route.abort());
      await page.addInitScript(() => {
        localStorage.setItem('jipage_bookmarks_v1', '[]');
      });
      const base = `http://127.0.0.1:${server.httpServer.address().port}`;
      await page.goto(base);
      const href = await page.locator('link[rel="icon"]').getAttribute('href');
      assert.equal(href, '/favicon.ico?v=jigeqiu-a2-equator-1');
      const logo = page.getByRole('banner').getByRole('button', { name: '记个球首页', exact: true }).locator('img');
      await logo.waitFor();
      assert.equal(await logo.getAttribute('src'), '/brand/logo-a2-equator.png');
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        for (const language of ['zh', 'en']) {
          for (const dark of [false, true]) {
            await page.evaluate(({ language, dark }) => localStorage.setItem('jipage_settings_v1', JSON.stringify({
              language, appearanceMode: dark ? 'dark-glass' : 'light-glass',
            })), { language, dark });
            await page.reload();
            const header = page.getByRole('banner');
            const home = header.getByRole('button', { name: language === 'zh' ? '记个球首页' : 'JIGEQIU home', exact: true });
            await home.locator('img').evaluate(image => image.decode());
            assert.equal(await home.innerText(), '', 'Brand image does not duplicate its internal text with an outside wordmark');
            const imageBox = await home.locator('img').boundingBox();
            const controlsBox = await header.getByRole('navigation').boundingBox();
            assert.ok(imageBox.x + imageBox.width < controlsBox.x, 'Logo and navigation do not overlap');
            assert.equal(imageBox.width, imageBox.height);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            await header.getByRole('button', { name: language === 'zh' ? '切换为英文' : 'Switch to Chinese', exact: true }).waitFor();
            await page.screenshot({ path: `/tmp/jigeqiu-favicon/${mode}-${width}-${language}-${dark ? 'dark' : 'light'}.png` });
            await header.getByRole('button', { name: language === 'zh' ? '管理中心' : 'Manage', exact: true }).click();
            await page.waitForURL('**/#/library');
            await home.locator('img').evaluate(image => image.decode());
            await home.click();
            await page.waitForURL('**/#/');
          }
        }
      }
      await page.goto(`${base}/?workspace=import`);
      await page.getByRole('button', { name: '记个球首页', exact: true }).locator('img').evaluate(image => image.decode());
      for (const path of ['/brand/logo-a2-equator.png', '/apple-touch-icon.png']) {
        const response = await page.request.get(`${base}${path}`);
        assert.equal(response.status(), 200);
        assert.deepEqual(await response.body(), await readFile(`public${path}`));
      }
      for (const path of [href, '/favicon.ico']) {
        const response = await page.request.get(`${base}${path}`);
        assert.equal(response.status(), 200);
        assert.match(response.headers()['content-type'], /image\/(?:x-icon|vnd\.microsoft\.icon)/);
        assert.deepEqual(await response.body(), await readFile('public/favicon.ico'));
      }
      await page.setContent(`<img src="${base}${href}" width="192" height="192" alt="记个球 favicon">`);
      const colors = await page.locator('img').evaluate(async image => {
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 48;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, 48, 48);
        const pixels = context.getImageData(0, 0, 48, 48).data;
        let blue = 0;
        let white = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] < 200) continue;
          if (pixels[i] < 60 && pixels[i + 1] > 70 && pixels[i + 1] < 130 && pixels[i + 2] > 210) blue++;
          if (pixels[i] > 220 && pixels[i + 1] > 220 && pixels[i + 2] > 220) white++;
        }
        return { blue, white };
      });
      assert.ok(colors.blue > 1000, JSON.stringify(colors));
      assert.ok(colors.white > 100, JSON.stringify(colors));
      await page.locator('img').screenshot({ path: `/tmp/jigeqiu-favicon/${mode}.png` });
      console.log(`PASS ${mode}: versioned favicon declaration, genuine ICO response, browser decode and brand pixels`);
    } finally {
      await page.close();
      if (mode === 'development') await server.close();
      else await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
    }
  }
} finally {
  await browser.close();
}
