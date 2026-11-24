import assert from 'node:assert/strict';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'link-health-test-page',
  configureServer(server) {
    server.middlewares.use('/health-capacity.html', async (_request, response) => {
      const html = await server.transformIndexHtml('/health-capacity.html', '<html><body><div id="root"></div><script type="module" src="/tests/fixtures/link-health-capacity.tsx"></script></body></html>');
      response.setHeader('Content-Type', 'text/html');
      response.end(html);
    });
  },
}] });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const count of [10_000, 50_000]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/health-capacity.html?count=${count}`);
    await page.evaluate(() => {
      globalThis.healthLongTasks = [];
      globalThis.healthTicks = 0;
      globalThis.healthTicker = setInterval(() => { globalThis.healthTicks++; }, 10);
      new PerformanceObserver(list => globalThis.healthLongTasks.push(...list.getEntries().map(entry => entry.duration))).observe({ type: 'longtask', buffered: false });
    });
    const started = Date.now();
    await page.getByRole('button', { name: 'Start scan', exact: true }).click();
    const search = page.getByRole('searchbox', { name: 'Search abnormal links', exact: true });
    await search.fill('Capacity');
    assert.equal(await search.inputValue(), 'Capacity');
    await page.getByText('Scan complete', { exact: true }).waitFor({ timeout: 30_000 });
    assert.equal(await page.locator('[data-health-row]').count(), 15);
    await search.fill(`Capacity ${count - 1}`);
    await page.getByText(`Capacity ${count - 1}`, { exact: true }).waitFor();
    assert.equal(await page.locator('[data-health-row]').count(), 1);
    const metrics = await page.evaluate(() => {
      clearInterval(globalThis.healthTicker);
      return { ticks: globalThis.healthTicks, longTasks: globalThis.healthLongTasks };
    });
    assert.ok(metrics.ticks > 5, 'event loop stays responsive during scan');
    assert.ok(Math.max(0, ...metrics.longTasks) < 250, 'no scan task blocks the UI for 250ms');
    console.log(JSON.stringify({ count, elapsedMs: Date.now() - started, ...metrics }));
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally { await browser?.close(); await server.close(); }
