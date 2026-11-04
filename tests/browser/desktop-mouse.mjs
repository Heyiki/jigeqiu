import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const output = '/tmp/jigeqiu-desktop-mouse';
  await mkdir(output, { recursive: true });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
    const context = await browser.newContext({ viewport });
    await context.route('https://**/*', route => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.getByTestId('desktop-viewport').waitFor();
    const x = 8;
    const y = Math.round(viewport.height * 0.6);
    const preview = page.getByTestId('desktop-gesture-preview');
    const start = async () => { await page.mouse.move(x, y); await page.mouse.down(); };
    const move = (dx, dy) => page.mouse.move(x + dx, y + dy, { steps: 4 });
    const end = () => page.mouse.up();
    const noPanel = async () => assert.equal(await page.locator('[data-panel="launchpad"],[data-panel="search"]').count(), 0);
    for (const [language, dark] of [['zh', false], ['zh', true], ['en', false], ['en', true]]) {
      await page.evaluate(({ language, dark }) => localStorage.setItem('jipage_settings_v1', JSON.stringify({
        language, appearanceMode: dark ? 'dark-glass' : 'light-glass',
      })), { language, dark });
      await page.reload();
      await page.getByTestId('desktop-viewport').waitFor();
      const before = await page.evaluate(() => localStorage.getItem('jipage_library_v2'));
      await start();
      await move(12, 2);
      await move(15, -40);
      assert.equal(await preview.getAttribute('data-target'), 'launchpad');
      assert.equal(await preview.evaluate(el => Number(getComputedStyle(el).opacity)), 1);
      await page.screenshot({ path: `${output}/${viewport.width}-${language}-${dark ? 'dark' : 'light'}-preview.png` });
      await end();
      const launchpad = page.locator('[data-panel="launchpad"]');
      await launchpad.waitFor();
      assert.equal(await launchpad.locator('input').evaluate(el => el === document.activeElement), true,
        'Mouse invocation retains keyboard search focus');
      await page.keyboard.press('Escape');
      await start();
      await move(4, 38);
      await end();
      const search = page.locator('[data-panel="search"]');
      await search.waitFor();
      assert.equal(await search.locator('input').first().evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Escape');
      for (const points of [[[2, 5]], [[0, -28]], [[40, 40]], [[0, -60], [0, -40], [0, -85]]]) {
        await start();
        for (const [dx, dy] of points) await move(dx, dy);
        await end();
        await noPanel();
      }
      for (const direction of [-1, 1]) {
        await start();
        await move(0, 40 * direction);
        await move(60, 45 * direction);
        assert.equal(await preview.evaluate(el => Number(getComputedStyle(el).opacity)), 0,
          'A sideways drift must not leave a ready preview for a rejected release');
        await end();
        await noPanel();
      }
      await start();
      await move(0, 40);
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await end();
      await noPanel();
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-testid="desktop-gesture-preview"]')).opacity) === 0);
      assert.equal(await page.evaluate(() => localStorage.getItem('jipage_library_v2')), before);
      assert.equal(await page.evaluate(() => window.scrollX || window.scrollY), 0);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start();
    await move(0, -40);
    assert.equal(await preview.evaluate(el => el.getAnimations().length), 0);
    await end();
    await page.locator('[data-panel="launchpad"]').waitFor();
    await page.keyboard.press('Escape');
    // Seed only this isolated browser to verify paging and icon drag ownership.
    await page.evaluate(async () => {
      const time = 1700000000000;
      localStorage.setItem('jipage_bookmarks_v1', JSON.stringify(Array.from({ length: 100 }, (_, index) => ({
        id: `mouse-${index}`, title: `Mouse bookmark ${index}`, url: `https://example.org/mouse/${index}`,
        domain: 'example.org', category: 'uncategorized', tags: [], notes: '', keywords: [],
        pinnedToDesktop: true, order: index, collectionIds: [], createdAt: time, updatedAt: time,
      }))));
      const { StorageManager } = await import('/src/services/storage.ts');
      new StorageManager().setDesktopPins(Array.from({ length: 100 }, (_, i) => `mouse-${i}`), true);
    });
    await page.reload();
    await page.getByTestId('desktop-viewport').waitFor();
    const pageIndex = () => page.evaluate(() =>
      Array.from(document.querySelector('.desktop-gesture-track').children).findIndex(el => el.dataset.active === 'true'));
    const cdp = await context.newCDPSession(page);
    const flickPage = async (direction, expected, pause = false) => {
      const sx = direction < 0 ? viewport.width - 8 : 8;
      await page.mouse.move(sx, y);
      const timestamp = Date.now() / 1000;
      // Explicit input timestamps keep short release-speed tests independent of CI latency.
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed', x: sx, y, button: 'left', buttons: 1, clickCount: 1, timestamp,
      });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: sx + 9 * direction, y: y + 1, buttons: 1, timestamp: timestamp + 0.02,
      });
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: sx + 18 * direction, y: y + 2, buttons: 1, timestamp: timestamp + 0.04,
      });
      const ready = page.locator('.desktop-pagination [data-gesture-ready="true"]');
      assert.equal(await ready.count(), 1, 'A short flick shows current release eligibility');
      if (pause) {
        await page.waitForTimeout(150);
        assert.equal(await ready.count(), 0, 'Paused flick readiness expires without pointer movement');
      }
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: sx + 18 * direction, y: y + 2,
        button: 'left', buttons: 0, clickCount: 1, timestamp: timestamp + (pause ? 0.2 : 0.05),
      });
      await page.waitForFunction(expected =>
        Array.from(document.querySelector('.desktop-gesture-track').children).findIndex(el => el.dataset.active === 'true') === expected, expected);
      // Movement after release is ordinary pointing, not a second gesture.
      await page.mouse.move(viewport.width / 2, y);
      assert.equal(await pageIndex(), expected);
      await noPanel();
    };
    const dragPage = async (points, expected, pause = 0) => {
      const direction = Math.sign(points[0][0]);
      const sx = direction < 0 ? viewport.width - 8 : 8;
      const previous = await pageIndex();
      await page.mouse.move(sx, y);
      await page.mouse.down();
      for (const [dx, dy] of points) await page.mouse.move(sx + dx, y + dy, { steps: 5 });
      assert.equal(await pageIndex(), previous, 'Dragging follows the pointer without paging before release');
      if (pause) await page.waitForTimeout(pause);
      await page.mouse.up();
      await page.waitForFunction(expected =>
        Array.from(document.querySelector('.desktop-gesture-track').children).findIndex(el => el.dataset.active === 'true') === expected, expected);
      await noPanel();
    };
    for (const dark of [false, true]) {
      await page.evaluate(dark => {
        const saved = JSON.parse(localStorage.getItem('jipage_settings_v1'));
        localStorage.setItem('jipage_settings_v1', JSON.stringify({ ...saved, appearanceMode: dark ? 'dark-glass' : 'light-glass' }));
      }, dark);
      await page.reload();
      await page.getByTestId('desktop-viewport').waitFor();
      await page.emulateMedia({ reducedMotion: dark ? 'reduce' : 'no-preference' });
      const beforePaging = await page.evaluate(() => localStorage.getItem('jipage_library_v2'));
      const readyArrow = page.locator('.desktop-pagination [data-gesture-ready="true"]');
      const stroke = async (direction, points, release, expected) => {
        const sx = direction < 0 ? viewport.width - 8 : 8;
        await page.mouse.move(sx, y);
        const timestamp = Date.now() / 1000;
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mousePressed', x: sx, y, button: 'left', buttons: 1, clickCount: 1, timestamp,
        });
        for (const [dx, ms] of points) await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved', x: sx + dx * direction, y, buttons: 1, timestamp: timestamp + ms / 1000,
        });
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased', x: sx + release[0] * direction, y,
          button: 'left', buttons: 0, clickCount: 1, timestamp: timestamp + release[1] / 1000,
        });
        await page.waitForFunction(expected =>
          Array.from(document.querySelector('.desktop-gesture-track').children).findIndex(el => el.dataset.active === 'true') === expected, expected);
        assert.equal(await readyArrow.count(), 0);
        await noPanel();
      };
      await stroke(-1, [[20, 20], [8, 40], [45, 100]], [45, 105], 1);
      await stroke(1, [[20, 20], [8, 40], [45, 100]], [45, 105], 0);
      await stroke(-1, [[10, 20], [22, 45]], [21, 50], 1);
      await stroke(1, [[10, 20], [22, 45]], [21, 50], 0);
      await start();
      await move(-30, 2);
      assert.equal(await readyArrow.count(), 1, 'Eligible drag highlights the paging arrow');
      assert.equal(await readyArrow.getAttribute('data-page-direction'), 'next');
      assert.equal(await readyArrow.evaluate(el => getComputedStyle(el).boxShadow !== 'none'), true);
      await page.screenshot({ path: `${output}/${viewport.width}-${dark ? 'dark' : 'light'}-paging-ready.png` });
      await page.waitForTimeout(150);
      assert.equal(await readyArrow.count(), 1, 'Slow distance readiness does not expire');
      await move(-45, 2);
      await move(-30, 2);
      assert.equal(await readyArrow.count(), 0, 'Deliberate retraction clears readiness');
      await end();
      assert.equal(await pageIndex(), 0);
      await start();
      await move(30, 2);
      assert.equal(await readyArrow.count(), 0, 'Unavailable edge never highlights');
      await end();
      await start();
      await move(-30, 2);
      assert.equal(await readyArrow.count(), 1);
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      assert.equal(await readyArrow.count(), 0, 'Cancellation clears the arrow');
      await end();
      await start();
      await move(-30, 2);
      assert.equal(await readyArrow.count(), 1);
      await move(-30, 40);
      assert.equal(await readyArrow.count(), 0, 'Correcting startup toward search clears paging readiness');
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await end();
      await dragPage([[-28, 4]], 1, 150);
      await dragPage([[28, 4]], 0, 150);
      await dragPage([[-27, 2]], 0, 150);
      await dragPage([[-20, 2]], 0, 150);
      await dragPage([[-12, 1]], 0);
      await flickPage(-1, 1);
      await flickPage(1, 0);
      await flickPage(-1, 0, true);
      await dragPage([[-60, 60]], 0);
      await dragPage([[-100, 2], [-60, 3], [-130, 3]], 0);
      await dragPage([[-36, 2], [-24, 3], [-60, 3]], 0);
      await dragPage([[60, 2]], 0);
      // A long stroke still commits only one page, including at the final boundary.
      await dragPage([[-350, 4]], 1);
      await page.mouse.move(x, y);
      await page.waitForFunction(() => Math.abs(
        document.querySelector('.desktop-gesture-track [data-active="true"]').getBoundingClientRect().left
        - document.querySelector('[data-testid="desktop-viewport"]').getBoundingClientRect().left,
      ) < 1);
      await page.screenshot({ path: `${output}/${viewport.width}-${dark ? 'dark' : 'light'}-short-paging.png` });
      const lastButton = page.locator('.desktop-pagination button[aria-label]').last();
      const lastIndex = await page.locator('.desktop-pagination button[aria-label]').count() - 1;
      await lastButton.click();
      await dragPage([[-60, 2]], lastIndex);
      await page.locator('.desktop-pagination button[aria-label]').first().click();
      assert.equal(await page.evaluate(() => localStorage.getItem('jipage_library_v2')), beforePaging);
      assert.equal(await page.evaluate(() => window.scrollX || window.scrollY), 0);
    }
    const current = () => page.locator('.desktop-pagination [aria-current="page"]').getAttribute('aria-label');
    const first = await current();
    await start();
    await move(-135, 5);
    await end();
    await page.waitForFunction(before => document.querySelector('.desktop-pagination [aria-current="page"]')?.getAttribute('aria-label') !== before, first);
    await noPanel();
    const second = await current();
    await page.mouse.move(x, y);
    await page.mouse.wheel(-70, 0);
    await page.waitForFunction(before => document.querySelector('.desktop-pagination [aria-current="page"]')?.getAttribute('aria-label') !== before, second);
    await noPanel();
    const icon = page.locator('[data-active="true"] [data-desktop-id]').first();
    await icon.waitFor();
    const bounds = await icon.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 32);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 80, { steps: 8 });
    await page.getByTestId('desktop-drag-preview').waitFor();
    await noPanel();
    await page.mouse.up();
    await noPanel();
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS desktop mouse: startup correction, tiny release reversal, ready arrow and expiry, short vertical drags, 28px slow paging and 18px flicks, paused drags rejected, post-release motion ignored, one page per release, retract/jitter/diagonal/edge guards, focus, light/dark, zh/en, reduced motion, wheel and icon drag ownership');
} finally {
  await browser?.close();
  await server.close();
}
