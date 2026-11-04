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
      const base = `http://127.0.0.1:${server.httpServer.address().port}`;
      await page.goto(base);
      const href = await page.locator('link[rel="icon"]').getAttribute('href');
      assert.equal(href, '/favicon.ico?v=jigeqiu-1');
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
          if (pixels[i] < 30 && pixels[i + 1] > 100 && pixels[i + 2] > 170) blue++;
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
