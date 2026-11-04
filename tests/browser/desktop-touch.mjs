import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  await mkdir('/tmp/jigeqiu-desktop-touch', { recursive: true });
  for (const viewport of [
    { width: 390, height: 844 }, { width: 320, height: 740 },
    { width: 820, height: 1180 }, { width: 1180, height: 820 },
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    await context.route('https://**/*', route => route.fulfill({ body: '' }));
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    await page.getByTestId('desktop-viewport').waitFor();
    const x = 8;
    const y = Math.round(viewport.height * 0.6);
    const send = (type, points) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: points.map(([px, py, id = 1]) => ({ x: px, y: py, id })),
    });
    const start = () => send('touchStart', [[x, y]]);
    const move = (dx, dy) => send('touchMove', [[x + dx, y + dy]]);
    const end = () => send('touchEnd', []);
    const stroke = async (dx, dy, duration = 360) => {
      await start();
      const steps = duration < 100 ? 2 : 6;
      for (let step = 1; step <= steps; step++) {
        // CDP already waits for a frame per dispatch; extra waits turn flicks into slow drags.
        if (duration >= 100) await page.waitForTimeout(duration / steps);
        await move(dx * step / steps, dy * step / steps);
      }
      await end();
    };
    for (const dark of [false, true]) {
      await page.evaluate(dark => {
        localStorage.setItem('jipage_settings_v1', JSON.stringify({
          appearanceMode: dark ? 'dark-glass' : 'light-glass', language: 'zh', showDock: true,
        }));
      }, dark);
      await page.reload();
      await page.getByTestId('desktop-viewport').waitFor();
      await start();
      await move(0, -65);
      const preview = page.getByTestId('desktop-gesture-preview');
      await preview.waitFor({ state: 'visible' });
      assert.equal(await preview.getAttribute('data-target'), 'launchpad');
      assert.ok(await preview.evaluate(el => Number(getComputedStyle(el).opacity)) > 0);
      await page.screenshot({ path: `/tmp/jigeqiu-desktop-touch/${viewport.width}-${dark ? 'dark' : 'light'}-preview.png` });
      await send('touchCancel', []);
      await page.waitForTimeout(250);
      assert.equal(await page.getByRole('dialog').count(), 0, 'Cancelled touch does not open anything');
      assert.equal(await preview.evaluate(el => Number(getComputedStyle(el).opacity)), 0);

      await stroke(0, -130);
      const launchpad = page.locator('[data-panel="launchpad"]');
      await launchpad.waitFor();
      assert.equal(await launchpad.locator('input').evaluate(el => el === document.activeElement), false,
        'Touch invocation lets users browse without focusing the keyboard');
      await page.screenshot({ path: `/tmp/jigeqiu-desktop-touch/${viewport.width}-${dark ? 'dark' : 'light'}-launchpad.png` });
      await page.keyboard.press('Escape');
      await launchpad.waitFor({ state: 'hidden' });

      await stroke(0, 42, 48);
      const search = page.locator('[data-panel="search"]');
      await search.waitFor();
      assert.equal(await search.locator('input').first().evaluate(el => el === document.activeElement), true);
      await page.setViewportSize({ width: viewport.width, height: 400 });
      const searchBox = await search.boundingBox();
      assert.ok(searchBox.y >= 0 && searchBox.y + searchBox.height <= 400,
        'Search fits the reduced viewport without clipping its input');
      await page.setViewportSize(viewport);
      await page.keyboard.press('Escape');
      await search.waitFor({ state: 'hidden' });
      await stroke(0, 42, 480);
      assert.equal(await page.getByRole('dialog').count(), 0, 'A slow short drag is not a flick');
      await start();
      await move(0, 155);
      await page.waitForTimeout(80);
      await move(0, 100);
      await end();
      assert.equal(await page.getByRole('dialog').count(), 0, 'Retracting an armed drag cancels');
      await page.evaluate(() => document.addEventListener('pointerdown', event => {
        document.querySelector('[data-desktop-surface]').dataset.testPointer = String(event.pointerId);
      }, { once: true }));
      await start();
      await move(0, -120);
      // Exercise a final release coordinate not delivered as a preceding move sample.
      await page.evaluate(({ x, y }) => {
        const surface = document.querySelector('[data-desktop-surface]');
        surface.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, pointerId: Number(surface.dataset.testPointer),
          pointerType: 'touch', isPrimary: true, clientX: x, clientY: y - 60,
        }));
        delete surface.dataset.testPointer;
      }, { x, y });
      await send('touchCancel', []);
      assert.equal(await page.getByRole('dialog').count(), 0, 'Release-only retraction must cancel at the event boundary');
      await start();
      await move(0, -80);
      await send('touchStart', [[x, y - 80, 1], [x + 80, y, 2]]);
      await send('touchEnd', []);
      assert.equal(await page.getByRole('dialog').count(), 0, 'Second finger cancels the gesture');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.evaluate(() => window.scrollY), 0);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start();
    await move(0, -70);
    assert.equal(await page.getByTestId('desktop-gesture-preview').evaluate(el => el.getAnimations().length), 0);
    await send('touchCancel', []);
    await page.keyboard.press('Control+Shift+Space');
    // Keyboard entry still focuses search, independently of touch invocation.
    const panel = page.locator('[data-panel="launchpad"]');
    await panel.waitFor();
    assert.equal(await panel.locator('input').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    await page.evaluate(async () => {
      const time = 1700000000000;
      localStorage.setItem('jipage_bookmarks_v1', JSON.stringify(Array.from({ length: 100 }, (_, index) => ({
        id: `touch-${index}`, title: `Touch bookmark ${index}`, url: `https://example.org/touch/${index}`,
        domain: 'example.org', category: 'uncategorized', tags: [], notes: '', keywords: [],
        pinnedToDesktop: true, order: index, collectionIds: [], createdAt: time, updatedAt: time,
      }))));
      const { StorageManager } = await import('/src/services/storage.ts');
      new StorageManager().setDesktopPins(Array.from({ length: 100 }, (_, i) => `touch-${i}`), true);
    });
    await page.reload();
    const firstIcon = page.locator('[data-active="true"] [data-desktop-id]').first();
    await firstIcon.waitFor();
    const icon = await firstIcon.boundingBox();
    const ix = icon.x + icon.width / 2;
    const iy = icon.y + 32;
    await send('touchStart', [[ix, iy]]);
    await page.waitForTimeout(80);
    await send('touchMove', [[ix, iy + 55]]);
    await page.waitForTimeout(160);
    await send('touchMove', [[ix, iy + 135]]);
    await end();
    await page.locator('[data-panel="search"]').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(context.pages().length, 1, 'Swiping from an icon must not open its URL in a tab');
    await page.getByRole('navigation', { name: '桌面分页' }).waitFor();
    const pageBefore = await page.locator('.desktop-pagination [aria-current="page"]').getAttribute('aria-label');
    // Start in the right gutter, outside all icon buttons.
    const px = viewport.width - 5;
    await send('touchStart', [[px, y]]);
    await page.waitForTimeout(60);
    await send('touchMove', [[px - 160, y + 4]]);
    await end();
    await page.waitForFunction(before => document.querySelector('.desktop-pagination [aria-current="page"]')?.getAttribute('aria-label') !== before, pageBefore);
    assert.equal(await page.getByRole('dialog').count(), 0, 'Horizontal paging does not invoke panels');
    const scrollSample = await page.evaluate(() => ({
      before: localStorage.getItem('jipage_library_v2'), x: window.scrollX, y: window.scrollY,
    }));
    await stroke(0, -130);
    await panel.waitFor();
    assert.equal(await panel.evaluate(el => document.activeElement === el), true,
      'A populated touch-opened launchpad keeps focus on its container, not a random icon');
    assert.equal(await page.getByRole('tooltip').count(), 0, 'Touch invocation must not leave a focused icon tooltip');
    assert.equal(context.pages().length, 1, 'Opening launchpad by swipe must not activate any bookmark');
    await page.screenshot({ path: `/tmp/jigeqiu-desktop-touch/${viewport.width}-populated-launchpad.png` });
    const list = panel.locator('.launchpad-scrollbar');
    const box = await list.boundingBox();
    await send('touchStart', [[box.x + box.width / 2, box.y + box.height * 0.8]]);
    await send('touchMove', [[box.x + box.width / 2, box.y + box.height * 0.3]]);
    await end();
    await page.waitForFunction(() => document.querySelector('.launchpad-scrollbar')?.scrollTop > 0);
    assert.equal(await page.locator('[data-panel="search"]').count(), 0, 'Launchpad scroll stays inside its panel');
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => ({
      before: localStorage.getItem('jipage_library_v2'), x: window.scrollX, y: window.scrollY,
    })), scrollSample, 'Touch navigation does not write bookmark data or scroll the document');
    await firstIcon.click({ button: 'right' });
    await page.getByRole('menu', { name: '桌面菜单' }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0, 'Context menus do not invoke panels');
    await page.keyboard.press('Escape');
    const popupPromise = page.waitForEvent('popup');
    await firstIcon.tap();
    const popup = await popupPromise;
    await popup.close();
    assert.equal(await page.getByRole('dialog').count(), 0, 'A normal icon tap still opens its URL');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS desktop touch: phone/tablet portrait/landscape, day/night, feedback, flick/drag/retract, cancel/multitouch, focus and reduced motion');
} finally {
  await browser?.close();
  await server.close();
}
