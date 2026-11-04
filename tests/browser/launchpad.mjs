import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
const screenshots = process.env.SCREENSHOT_DIR ?? 'test-results/screenshots';
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
  context.setDefaultTimeout(8000);
  await context.route('https://**/*', route => route.fulfill({ body: 'Destination' }));
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.evaluate(() => {
    localStorage.clear();
    const names = ['Alpha', 'Beta', 'Gamma', 'Unsplash', '中文工具', '设计素材', '同名收藏', '同名收藏'];
    const bookmarks = names.map((title, index) => ({
      id: `lp${index}`, title, url: `https://example.org/${index}`, domain: 'example.org',
      folderId: index % 2 ? 'deep' : 'archive', category: 'cat-inbox', notes: `Private note ${index}`,
      keywords: index === 3 ? ['图片', '壁纸'] : [], pinnedToDesktop: index === 0,
      order: index, collectionIds: [], createdAt: 1, updatedAt: 2,
    }));
    bookmarks.push({ ...bookmarks[0], id: 'same-url', title: 'URL copy', pinnedToDesktop: false });
    for (let index = 0; index < 30; index++) bookmarks.push({
      ...bookmarks[0], id: `more${index}`, title: `Alpha ${String(index).padStart(2, '0')}${index === 0 ? ' 完整网站名称与设计资源' : ''}`,
      url: `https://example.org/more/${index}`, pinnedToDesktop: false,
    });
    bookmarks.push({ ...bookmarks[0], id: 'unsafe', title: 'Unsafe fixture', url: 'javascript:alert(1)' });
    localStorage.setItem('jipage_bookmarks_v1', JSON.stringify(bookmarks));
    localStorage.setItem('jipage_folders_v1', JSON.stringify([
      { id: 'archive', name: '工作', bookmarkIds: bookmarks.filter(item => item.folderId === 'archive').map(item => item.id), pinnedToDesktop: false, order: 0, createdAt: 1, updatedAt: 2 },
      { id: 'deep', name: '设计', parentId: 'archive', bookmarkIds: bookmarks.filter(item => item.folderId === 'deep').map(item => item.id), pinnedToDesktop: false, order: 1, createdAt: 1, updatedAt: 2 },
    ]));
    localStorage.setItem('jipage_settings_v1', JSON.stringify({
      appearanceMode: 'light-glass', wallpaperPreset: 'cyan-lake', desktopViewMode: 'icon',
      language: 'zh', showDock: true, dockIconSize: 48, dockBookmarkIds: ['lp0'],
    }));
  });
  await page.reload();
  await page.evaluate(async () => {
    const { StorageManager } = await import('/src/services/storage.ts');
    new StorageManager().setDesktopPins(['lp0', 'unsafe'], true);
  });
  await page.reload();
  const before = await page.evaluate(() => localStorage.getItem('jipage_library_v2'));
  const trigger = page.getByTitle('启动台 · 所有应用与收藏 (桌面上滑亦可展开)');
  const launchpad = page.getByRole('dialog', { name: '启动台', exact: true });
  const search = launchpad.getByRole('searchbox', { name: '搜索收藏', exact: true });
  const results = launchpad.locator('[data-launchpad-bookmark]');
  const selected = () => launchpad.locator('[data-launchpad-bookmark][data-selected="true"]');
  const open = async () => {
    await trigger.click();
    await launchpad.waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '搜索收藏');
  };
  const enterOpens = async expected => {
    const popupPromise = context.waitForEvent('page');
    await page.keyboard.press('Enter');
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.equal(popup.url(), expected);
    await popup.close();
    await launchpad.waitFor({ state: 'hidden' });
  };
  await open();
  assert.equal(await search.evaluate(element => document.activeElement === element), true);
  assert.equal(await results.count(), 39, 'All valid bookmarks appear, including nested and duplicate URL records');
  const iconBounds = await results.first().locator(':scope > div').first().boundingBox();
  assert.ok(iconBounds && iconBounds.width >= 60 && iconBounds.height >= 60,
    `Launchpad favicon retains its fixed dimensions: ${JSON.stringify(iconBounds)}`);
  await results.first().locator('svg').waitFor();
  const headerColor = await launchpad.getByRole('heading', { name: '启动台', exact: true })
    .evaluate(element => getComputedStyle(element).color);
  assert.equal(headerColor, 'rgb(248, 250, 252)', 'Day launchpad uses the approved light heading over its dark wallpaper wash');
  assert.equal(await launchpad.locator('[data-launchpad-folder]').count(), 0);
  assert.equal(await results.filter({ hasText: '同名收藏' }).count(), 2);
  assert.doesNotMatch(await results.filter({ hasText: 'Beta' }).innerText(), /工作|设计|example\.org/,
    'No directory or domain subtitle is displayed');
  assert.equal(await results.locator('[title]').count(), 0, 'Icons have no nested native title');
  assert.equal(await results.evaluateAll(elements => elements.some(element => element.hasAttribute('title'))), false);
  await search.fill('Alpha 00');
  const longEntry = results.first();
  const label = longEntry.locator('[data-desktop-label]');
  await label.waitFor();
  const labelStyle = await label.evaluate(element => {
    const style = getComputedStyle(element);
    return { whiteSpace: style.whiteSpace, overflow: style.overflow, textOverflow: style.textOverflow, color: style.color };
  });
  assert.deepEqual(labelStyle, { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip', color: 'rgb(248, 250, 252)' });
  const baseBounds = await label.boundingBox();
  await longEntry.hover();
  const tip = page.getByRole('tooltip', { name: 'Alpha 00 完整网站名称与设计资源', exact: true });
  await tip.waitFor();
  const tipBounds = await tip.boundingBox();
  assert.ok(Math.abs(baseBounds.x - tipBounds.x) < 1 && Math.abs(baseBounds.y - tipBounds.y) < 1,
    'Full name expands from the original label position');
  assert.ok(tipBounds.width > baseBounds.width);
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: `${screenshots}/launchpad-label-light.png` });
  await page.mouse.move(0, 0);
  await tip.waitFor({ state: 'hidden' });
  await longEntry.focus();
  await tip.waitFor();
  await search.focus();
  await tip.waitFor({ state: 'hidden' });
  await page.evaluate(() => document.documentElement.classList.add('dark', 'dark-glass'));
  const searchBackground = await search.evaluate(element => getComputedStyle(element).backgroundColor);
  assert.ok(searchBackground.match(/[\d.]+/g).slice(0, 3).map(Number).every(channel => channel < 80),
    'Focused night search uses a dark background');
  await longEntry.focus();
  assert.equal(await search.evaluate(element => getComputedStyle(element).backgroundColor), searchBackground,
    'Unfocused night search keeps the same dark background');
  await longEntry.hover();
  await tip.waitFor();
  await page.screenshot({ path: `${screenshots}/launchpad-label-dark.png` });
  await search.focus();
  await page.mouse.move(0, 0);
  assert.equal(await search.evaluate(element => getComputedStyle(element).backgroundColor), searchBackground);
  await page.evaluate(() => document.documentElement.classList.remove('dark', 'dark-glass'));
  await search.fill('');
  await page.keyboard.press('Enter');
  assert.equal(context.pages().length, 1, 'Blank search Enter cannot open the first bookmark');
  await page.keyboard.press('ArrowDown');
  assert.equal(await selected().getAttribute('data-launchpad-bookmark'), 'lp0');
  assert.equal(await selected().evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('ArrowRight');
  assert.equal(await selected().getAttribute('data-launchpad-bookmark'), 'more0');
  await page.keyboard.press('Tab');
  assert.equal(await selected().getAttribute('data-launchpad-bookmark'), 'more1');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await selected().getAttribute('data-launchpad-bookmark'), 'more0');
  await page.keyboard.press('ArrowDown');
  const down = await selected().getAttribute('data-launchpad-bookmark');
  assert.notEqual(down, 'more0', 'ArrowDown changes rows');
  await page.keyboard.press('ArrowUp');
  assert.equal(await selected().getAttribute('data-launchpad-bookmark'), 'more0');
  await search.fill('Alpha');
  await search.evaluate(element => element.setSelectionRange(2, 2));
  await page.keyboard.press('ArrowLeft');
  assert.equal(await search.evaluate(element => element.selectionStart), 1, 'Input arrow keys preserve caret editing');
  assert.equal(await search.evaluate(element => document.activeElement === element), true);
  await search.fill('壁纸');
  assert.equal(await results.count(), 1);
  assert.equal(await selected().getAttribute('data-launchpad-bookmark'), 'lp3');
  await enterOpens('https://example.org/3');
  assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'Close restores opener focus');
  await open();
  await search.fill('zhongwengongju');
  assert.equal(await results.count(), 1, 'Full pinyin matches Chinese bookmark names');
  await search.fill('zwgj');
  assert.equal(await results.count(), 1, 'Pinyin initials match');
  await search.fill('gongzuo sheji');
  assert.equal(await results.filter({ hasText: 'Beta' }).count(), 1, 'Nested path pinyin participates in search');
  await search.fill('not-a-real-result');
  assert.equal(await results.count(), 0);
  await page.keyboard.press('Enter');
  assert.equal(context.pages().length, 1, 'No results cannot fall back to external search');
  await search.fill('壁纸');
  await search.dispatchEvent('compositionstart');
  await search.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229, bubbles: true });
  assert.equal(context.pages().length, 1, 'Composing Enter does not navigate');
  await results.first().focus();
  await page.keyboard.press('Enter');
  assert.equal(await launchpad.isVisible(), true, 'Composing Enter cannot activate a native result button');
  assert.equal(context.pages().length, 1, 'IME guard also blocks native result-button Enter activation');
  await search.focus();
  await page.keyboard.press('Escape');
  assert.equal(await launchpad.isVisible(), true, 'Composing Escape cannot dismiss launchpad');
  await search.dispatchEvent('compositionend', { data: '壁纸' });
  await search.fill('壁纸');
  await enterOpens('https://example.org/3');
  await open();
  await search.fill('Alpha 29');
  await page.keyboard.press('Tab');
  assert.equal(await selected().getAttribute('data-launchpad-bookmark'), 'more29');
  await page.keyboard.press('Tab');
  assert.equal(await launchpad.getByRole('button', { name: '关闭启动台', exact: true }).evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await search.evaluate(element => element === document.activeElement), true, 'Tab returns to search after close control');
  await page.keyboard.press('Escape');
  await launchpad.waitFor({ state: 'hidden' });
  await open();
  await search.fill('Beta');
  await results.first().click({ button: 'right' });
  const menu = launchpad.getByRole('menu', { name: '收藏操作', exact: true });
  const beforePin = await page.evaluate(() => localStorage.getItem('jipage_library_v2'));
  await page.evaluate(() => {
    window.launchpadOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  });
  await menu.getByRole('menuitem', { name: '固定到桌面', exact: true }).click();
  await launchpad.getByRole('alert').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('jipage_library_v2')), beforePin,
    'Failed launchpad pin preserves complete source library and layout');
  await page.evaluate(() => { Storage.prototype.setItem = window.launchpadOriginalSetItem; });
  await results.first().click({ button: 'right' });
  await menu.getByRole('menuitem', { name: '固定到桌面', exact: true }).click();
  const pinned = await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_library_v2')));
  assert.deepEqual(pinned.bookmarks.map(({ lastUsedAt, ...item }) => item), JSON.parse(before).bookmarks);
  assert.deepEqual(pinned.folders, JSON.parse(before).folders);
  assert.ok(pinned.desktopLayout.shortcuts.some(item => item.bookmarkId === 'lp1'));
  await results.first().click({ button: 'right' });
  assert.equal(await menu.getByRole('menuitem', { name: '在全部收藏中定位', exact: true }).innerText(),
    '在全部收藏中定位\n全部收藏 / 工作 / 设计');
  assert.ok(await menu.getByRole('separator').count() >= 3, 'Launchpad uses desktop action groups');
  await menu.getByRole('menuitem', { name: '从桌面移除', exact: true }).click();
  const removal = page.getByRole('alertdialog', { name: '从桌面移除', exact: true });
  await removal.waitFor();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_library_v2'))), pinned,
    'Launchpad shortcut removal waits for confirmation');
  await page.keyboard.press('Escape');
  await removal.waitFor({ state: 'hidden' });
  assert.equal(await launchpad.isVisible(), true, 'Canceling confirmation leaves launchpad open');
  await results.first().click({ button: 'right' });
  await menu.getByRole('menuitem', { name: '固定到任务栏', exact: true }).click();
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_library_v2')).dockBookmarkIds.includes('lp1')));
  await results.first().click({ button: 'right' });
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  assert.equal(await launchpad.isVisible(), true, 'First Escape dismisses menu, not launchpad');
  await results.first().click({ button: 'right' });
  await menu.getByRole('menuitem', { name: '在全部收藏中定位', exact: true }).click();
  await launchpad.waitFor({ state: 'hidden' });
  await page.locator('[data-library-bookmark="lp1"]').waitFor();
  assert.equal(await page.locator('[data-library-bookmark="lp1"]').evaluate(element => element === document.activeElement), true);
  await page.getByTitle('点击返回首页桌面').click();
  await open();
  await search.fill('Alpha 29');
  await results.first().click({ button: 'right' });
  await menu.getByRole('menuitem', { name: '在全部收藏中定位', exact: true }).click();
  const revealed = page.locator('[data-library-bookmark="more29"]');
  await revealed.waitFor();
  assert.equal(await revealed.evaluate(element => element === document.activeElement), true,
    'Manager reveal reaches the exact bookmark beyond its first page');
  await page.getByTitle('点击返回首页桌面').click();
  await open();
  await results.first().click({ button: 'right' });
  await menu.waitFor();
  await page.setViewportSize({ width: 1440, height: 600 });
  await results.first().click({ button: 'right' });
  await menu.waitFor();
  await launchpad.getByTestId('launchpad-scroll').evaluate(element => { element.scrollTop = 300; });
  await menu.waitFor({ state: 'hidden' });
  assert.equal(await launchpad.evaluate(element => element.contains(document.activeElement)), true,
    'Scrolling to dismiss a menu keeps keyboard focus inside launchpad');
  await page.keyboard.press('Escape');
  await launchpad.waitFor({ state: 'hidden' });
  await open();
  await results.first().click({ button: 'right' });
  await menu.waitFor();
  await page.setViewportSize({ width: 1000, height: 800 });
  await menu.waitFor({ state: 'hidden' });
  assert.equal(await launchpad.evaluate(element => element.contains(document.activeElement)), true,
    'Resize menu dismissal retains an Escape target');
  await page.keyboard.press('Escape');
  await launchpad.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open();
  await search.fill('');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-launchpad-bookmark]')].filter(element => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  }).every(element => element.querySelector('svg') || element.querySelector('img')?.naturalWidth > 0));
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: `${screenshots}/launchpad-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const overflow = await results.evaluateAll(elements => elements.filter(element => {
    const rect = element.getBoundingClientRect();
    return rect.left < 0 || rect.right > innerWidth;
  }).length);
  assert.equal(overflow, 0, 'Mobile icons fit their viewport');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  assert.equal(await selected().evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  }), true, 'Keyboard selection scrolls into view');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-launchpad-bookmark]')].filter(element => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  }).every(element => element.querySelector('svg') || element.querySelector('img')?.naturalWidth > 0));
  await page.screenshot({ path: `${screenshots}/launchpad-mobile.png`, fullPage: true });
  await page.evaluate(() => document.documentElement.classList.add('dark', 'dark-glass'));
  await search.fill('Alpha 00');
  await page.waitForFunction(() => document.querySelector('[data-testid="launchpad-scroll"]').scrollTop === 0);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await results.first().focus();
  const mobileTip = page.getByRole('tooltip');
  await mobileTip.waitFor();
  const mobileTipBounds = await mobileTip.boundingBox();
  assert.ok(mobileTipBounds.x >= 0 && mobileTipBounds.x + mobileTipBounds.width <= 390 - 6);
  assert.equal(await search.evaluate(element => getComputedStyle(element).backgroundColor), searchBackground,
    'Mobile night search has the same dark surface');
  await page.screenshot({ path: `${screenshots}/launchpad-mobile-dark.png` });
  await page.setViewportSize({ width: 320, height: 844 });
  await search.fill('Beta');
  const deleteSource = await page.evaluate(() => localStorage.getItem('jipage_library_v2'));
  await results.first().click({ button: 'right' });
  await menu.getByRole('menuitem', { name: '删除收藏…', exact: true }).click();
  const deleteConfirmation = page.getByRole('alertdialog', { name: '删除收藏', exact: true });
  await deleteConfirmation.waitFor();
  assert.match(await deleteConfirmation.innerText(), /回收站/);
  assert.equal(await page.evaluate(() => localStorage.getItem('jipage_library_v2')), deleteSource);
  const confirmBounds = await deleteConfirmation.boundingBox();
  assert.ok(confirmBounds.x >= 0 && confirmBounds.x + confirmBounds.width <= 320);
  await page.keyboard.press('Escape');
  await deleteConfirmation.waitFor({ state: 'hidden' });
  assert.equal(await results.first().evaluate(element => element === document.activeElement), true,
    'Canceling deletion returns focus to the bookmark');
  await page.keyboard.press('Shift+F10');
  await menu.getByRole('menuitem', { name: '删除收藏…', exact: true }).click();
  await page.evaluate(() => {
    window.launchpadOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  });
  await deleteConfirmation.getByRole('button', { name: '确认删除收藏', exact: true }).click();
  await deleteConfirmation.getByRole('alert').waitFor();
  assert.equal(await results.count(), 1, 'Failed delete keeps the launchpad icon');
  assert.equal(await page.evaluate(() => localStorage.getItem('jipage_library_v2')), deleteSource);
  await page.evaluate(() => { Storage.prototype.setItem = window.launchpadOriginalSetItem; });
  await deleteConfirmation.getByRole('button', { name: '确认删除收藏', exact: true }).click();
  await deleteConfirmation.waitFor({ state: 'hidden' });
  assert.equal(await results.count(), 0);
  assert.equal(await search.evaluate(element => element === document.activeElement), true,
    'Successful deletion returns keyboard focus to search');
  const deleted = await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_library_v2')));
  assert.equal(deleted.bookmarks.some(item => item.id === 'lp1'), false);
  assert.equal(deleted.desktopLayout.shortcuts.some(item => item.bookmarkId === 'lp1'), false);
  assert.equal(deleted.dockBookmarkIds.includes('lp1'), false);
  assert.equal(deleted.bookmarkTrash.find(item => item.bookmark.id === 'lp1').bookmark.title, 'Beta');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('banner').getByRole('button', { name: '管理中心', exact: true }).click();
  await page.getByLabel('管理中心小节', { exact: true }).selectOption('trash');
  await page.getByText('Beta', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: launchpad index/navigation/menus plus delete cancel/quota retry/trash persistence, desktop+Dock cleanup and 320px confirmation');
} finally {
  await browser?.close();
  await server.close();
}
