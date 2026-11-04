import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const built = process.env.TEST_BUILD === 'true';
const server = built ? await preview({ preview: { host: '127.0.0.1', port: 0 } })
  : await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  if (!built) await server.listen();
  browser = await chromium.launch({ headless: true });
  await mkdir('/tmp/jigeqiu-engine-order', { recursive: true });
  for (const language of ['zh', 'en']) {
    const en = language === 'en';
    const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, hasTouch: true });
    await context.route('https://**/*', route => route.fulfill({ body: '' }));
    await context.addInitScript(language => {
      if (!localStorage.getItem('jipage_settings_v1')) localStorage.setItem('jipage_settings_v1', JSON.stringify({ language, defaultSearchEngineId: 'se-google' }));
    }, language);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(8000);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/#/settings/search-engines`);
    const rows = page.locator('[data-engine-order-row]');
    await rows.first().waitFor();
    const ids = () => rows.evaluateAll(elements => elements.map(element => element.dataset.engineOrderRow));
    const initial = await ids();
    const settings = await page.evaluate(() => localStorage.getItem('jipage_settings_v1'));
    const handle = id => page.locator(`[data-engine-order-row="${id}"]`).getByRole('button', { name: en ? /^Drag to reorder/ : /^拖动排序/ });
    const menu = id => page.locator(`[data-engine-order-row="${id}"]`).getByRole('button', { name: en ? /^Reorder options/ : /^排序选项/ });
    await menu(initial[0]).click();
    const panel = page.locator('[data-engine-sort-panel]');
    await panel.waitFor();
    assert.ok(await panel.evaluate(element => {
      const color = getComputedStyle(element).backgroundColor;
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height - 22);
      return color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent' && element.contains(hit);
    }), 'sort panel must have a background and receive clicks above surrounding rows');
    assert.ok(await page.getByRole('button', { name: en ? 'Move up' : '上移', exact: true }).isDisabled());
    await page.getByRole('button', { name: en ? 'Move down' : '下移', exact: true }).click();
    await page.waitForFunction(first => document.querySelector('[data-engine-order-row]').dataset.engineOrderRow === first, initial[1]);
    await handle(initial[0]).focus();
    await page.keyboard.press('Alt+ArrowUp');
    await page.waitForFunction(first => document.querySelector('[data-engine-order-row]').dataset.engineOrderRow === first, initial[0]);
    await page.waitForFunction(id => document.activeElement?.closest('[data-engine-order-row]')?.dataset.engineOrderRow === id, initial[0]);
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForFunction(first => document.querySelector('[data-engine-order-row]').dataset.engineOrderRow === first, initial[1]);
    await page.keyboard.press('Alt+ArrowUp');
    await page.waitForFunction(first => document.querySelector('[data-engine-order-row]').dataset.engineOrderRow === first, initial[0]);
    const from = await handle(initial[1]).boundingBox();
    const target = await rows.first().boundingBox();
    await page.mouse.move(from.x + 22, from.y + 22);
    await page.mouse.down();
    await page.mouse.move(target.x + 22, target.y + 5, { steps: 8 });
    await page.locator('[data-engine-insertion]').waitFor();
    const ghost = page.locator('[data-engine-drag-preview]');
    await ghost.waitFor();
    assert.ok(await ghost.getByText('Bing', { exact: true }).count());
    assert.ok((await page.locator('[data-engine-insertion]').boundingBox()).height >= 44);
    const ghostBefore = await ghost.boundingBox();
    await page.mouse.move(target.x + 42, target.y + 25);
    const ghostAfter = await ghost.boundingBox();
    assert.ok(Math.abs(ghostAfter.y - ghostBefore.y) >= 10, 'the dragged row follows the pointer');
    await page.screenshot({ path: `/tmp/jigeqiu-engine-order/${language}-drag-preview.png` });
    await page.mouse.up();
    await page.waitForFunction(first => document.querySelector('[data-engine-order-row]').dataset.engineOrderRow === first, initial[1]);
    await page.reload();
    assert.equal((await ids())[0], initial[1]);
    assert.equal(await page.evaluate(() => localStorage.getItem('jipage_settings_v1')), settings);
    // Denied saves never publish a reordered UI.
    await page.evaluate(() => {
      window.originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'jipage_search_engines_v1') throw new DOMException('Full', 'QuotaExceededError');
        return window.originalSet.call(this, key, value);
      };
    });
    const before = await ids();
    await menu(before[0]).click();
    await page.getByRole('button', { name: en ? 'Move down' : '下移', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: en ? /storage is full/ : /空间不足/ }).waitFor();
    assert.deepEqual(await ids(), before);
    await page.evaluate(() => { Storage.prototype.setItem = window.originalSet; });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await rows.first().scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `/tmp/jigeqiu-engine-order/${language}-${width}.png` });
      await menu(before[0]).click();
      await panel.waitFor();
      const panelBox = await panel.boundingBox();
      assert.ok(panelBox.x >= 0 && panelBox.x + panelBox.width <= width && panelBox.y >= 0 && panelBox.y + panelBox.height <= 844);
      await page.evaluate(() => document.documentElement.classList.add('dark'));
      assert.ok(await panel.evaluate(element => {
        const box = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(box.x + 20, box.y + box.height - 20))
          && getComputedStyle(element).backgroundColor !== 'rgba(0, 0, 0, 0)';
      }));
      await page.screenshot({ path: `/tmp/jigeqiu-engine-order/${language}-menu-dark-${width}.png` });
      await page.keyboard.press('Escape');
      await page.evaluate(() => document.documentElement.classList.remove('dark'));
    }
    // Real touch events: early motion cancels; holding the handle activates dragging.
    const cdp = await context.newCDPSession(page);
    await rows.first().scrollIntoViewIfNeeded();
    const firstBox = await handle(before[0]).boundingBox();
    const secondBox = await rows.nth(1).boundingBox();
    const point = { x: firstBox.x + 22, y: firstBox.y + 22 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, y: point.y + 15 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.deepEqual(await ids(), before);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await page.waitForTimeout(300);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: secondBox.y + secondBox.height - 4 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(first => document.querySelector('[data-engine-order-row]').dataset.engineOrderRow === first, before[1]);
    assert.equal(await page.evaluate(() => localStorage.getItem('jipage_settings_v1')), settings);
    const touchOrder = await ids();
    // Esc cancels a mouse drag without writing.
    await rows.first().scrollIntoViewIfNeeded();
    const cancelBox = await handle(touchOrder[0]).boundingBox();
    await page.mouse.move(cancelBox.x + 22, cancelBox.y + 22);
    await page.mouse.down();
    await page.mouse.move(cancelBox.x + 22, cancelBox.y + 70, { steps: 4 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.deepEqual(await ids(), touchOrder);
    // Scrolling near the visible list edge continues while the pointer is held still.
    await page.setViewportSize({ width: 1280, height: 600 });
    await rows.first().scrollIntoViewIfNeeded();
    const edgeBox = await handle(touchOrder[0]).boundingBox();
    const getScroll = () => page.evaluate(() => {
      let element = document.querySelector('[data-engine-order-row]').parentElement;
      while (element && !(element.scrollHeight > element.clientHeight
        && /(auto|scroll)/.test(getComputedStyle(element).overflowY))) element = element.parentElement;
      return element?.scrollTop ?? scrollY;
    });
    const scrollBefore = await getScroll();
    await page.mouse.move(edgeBox.x + 22, edgeBox.y + 22);
    await page.mouse.down();
    await page.mouse.move(edgeBox.x + 22, 590, { steps: 8 });
    await page.waitForTimeout(350);
    assert.ok(await getScroll() > scrollBefore, 'dragging near bottom automatically scrolls the list');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.deepEqual(await ids(), touchOrder);
    // New records after a gesture starts must not be overwritten by a stale order.
    await page.setViewportSize({ width: 1280, height: 960 });
    await rows.first().scrollIntoViewIfNeeded();
    const staleBox = await handle(touchOrder[0]).boundingBox();
    const staleTarget = await rows.nth(2).boundingBox();
    await page.mouse.move(staleBox.x + 22, staleBox.y + 22);
    await page.mouse.down();
    await page.mouse.move(staleBox.x + 22, staleTarget.y + staleTarget.height - 4, { steps: 4 });
    await page.evaluate(() => {
      const engines = JSON.parse(localStorage.getItem('jipage_search_engines_v1'));
      engines.push({
        id: 'other-tab', name: 'Other', icon: 'Search', keyword: 'other',
        urlTemplate: 'https://other.example/?q={query}', isDefault: false,
      });
      localStorage.setItem('jipage_search_engines_v1', JSON.stringify(engines));
    });
    await page.mouse.up();
    await page.getByRole('alert').filter({ hasText: en ? /another tab/ : /其他标签页/ }).waitFor();
    assert.deepEqual(await ids(), touchOrder);
    assert.ok(await handle(touchOrder[0]).isDisabled());
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_search_engines_v1')).some(engine => engine.id === 'other-tab')));
    await page.reload();
    await rows.first().waitFor();
    const uncertainOrder = await ids();
    await page.evaluate(() => {
      window.originalSet = Storage.prototype.setItem;
      window.orderWrites = 0;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'jipage_search_engines_v1') {
          window.orderWrites++;
          return window.originalSet.call(this, key, `${value} `);
        }
        return window.originalSet.call(this, key, value);
      };
    });
    await menu(uncertainOrder[0]).click();
    await page.getByRole('button', { name: en ? 'Move down' : '下移', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.ok(await handle(uncertainOrder[0]).isDisabled());
    assert.ok(await menu(uncertainOrder[0]).isDisabled());
    assert.deepEqual(await ids(), uncertainOrder);
    assert.equal(await page.evaluate(() => window.orderWrites), 1);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(`PASS ${built ? 'production' : 'development'} ordering: menu, keyboard, mouse drag, touch hold/cancel, persistence, quota rollback, default preservation and mobile layouts`);
} finally {
  await browser?.close();
  if (built) await new Promise(resolve => server.httpServer.close(resolve));
  else await server.close();
}
