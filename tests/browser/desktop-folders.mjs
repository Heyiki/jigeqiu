import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
const screenshots = process.env.SCREENSHOT_DIR ?? 'test-results/screenshots';
let browser;
async function startDrag(page, source, point) {
  const rect = await source.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + 32);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 12, rect.y + 32, { steps: 3 });
  await page.mouse.move(point.x, point.y, { steps: 10 });
  await page.mouse.move(point.x, point.y);
}
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
  await context.route('https://**/*', route => route.fulfill({ body: 'Destination' }));
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const nativePrompts = [];
  page.on('dialog', dialog => {
    if (dialog.type() === 'prompt') {
      nativePrompts.push(dialog.message());
      void dialog.dismiss();
    }
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.evaluate(() => {
    localStorage.clear();
    const bookmarks = Array.from({ length: 8 }, (_, index) => ({
      id: `b${index}`, title: `Site ${index}`, url: `https://example.org/${index}`, domain: 'example.org',
      category: 'cat-inbox', notes: `Private ${index}`, keywords: [`key${index}`],
      folderId: index < 2 ? 'archive-child' : 'archive', pinnedToDesktop: index >= 2,
      order: index + 10, collectionIds: [], createdAt: 10, updatedAt: 20,
    }));
    const folders = [
      { id: 'archive', name: 'Original archive', bookmarkIds: bookmarks.slice(2).map(b => b.id), pinnedToDesktop: false, order: 1, createdAt: 1, updatedAt: 2 },
      { id: 'archive-child', name: 'Legacy desktop group', parentId: 'archive', bookmarkIds: ['b0', 'b1'], pinnedToDesktop: true, order: 2, createdAt: 1, updatedAt: 2 },
    ];
    localStorage.setItem('jipage_bookmarks_v1', JSON.stringify(bookmarks));
    localStorage.setItem('jipage_folders_v1', JSON.stringify(folders));
    localStorage.setItem('jipage_settings_v1', JSON.stringify({
      appearanceMode: 'light-glass', wallpaperPreset: 'cyan-lake', desktopViewMode: 'icon',
      language: 'zh', showDock: true, dockIconSize: 48, dockBookmarkIds: ['b2'],
    }));
  });
  await page.reload();
  const read = () => page.evaluate(() => {
    const combined = localStorage.getItem('jipage_library_v2');
    return combined ? JSON.parse(combined) : {
      bookmarks: JSON.parse(localStorage.getItem('jipage_bookmarks_v1')),
      folders: JSON.parse(localStorage.getItem('jipage_folders_v1')),
    };
  });
  const original = await read();
  const originalRaw = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  assert.equal(await page.locator('[data-desktop-id]').count(), 0, 'Legacy flags do not generate desktop groups or icons');
  await page.getByTitle('新建桌面文件夹', { exact: true }).click();
  const initialCreate = page.getByRole('dialog', { name: '新建桌面文件夹', exact: true });
  await initialCreate.waitFor();
  assert.equal(await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage)))), originalRaw);
  await initialCreate.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage)))), originalRaw);
  const seed = async fail => page.evaluate(async fail => {
    const { StorageManager } = await import('/src/services/storage.ts');
    const manager = new StorageManager();
    const originalWrite = Storage.prototype.setItem;
    if (fail) Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    try {
      manager.executeDesktop([
        ...Array.from({ length: 8 }, (_, i) => ({
          type: 'desktop.pin', bookmarkId: `b${i}`, shortcutId: `seed-shortcut-${i}`, to: { kind: 'root', index: i },
        })),
        { type: 'desktop.folder.create', id: 'seed-desktop-group', name: 'Legacy desktop group',
          shortcutIds: ['seed-shortcut-0', 'seed-shortcut-1'], index: 0 },
      ]);
      return null;
    } catch (error) {
      return error.name;
    } finally {
      Storage.prototype.setItem = originalWrite;
    }
  }, fail);
  assert.equal(await seed(true), 'QuotaExceededError');
  assert.equal(await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage)))), originalRaw);
  assert.equal(await seed(false), null);
  await page.reload();
  const converted = await read();
  assert.deepEqual(converted.bookmarks, original.bookmarks);
  assert.deepEqual(converted.folders, original.folders);
  assert.ok(converted.desktopLayout);
  const invariant = async () => {
    const library = await read();
    assert.deepEqual(library.bookmarks, original.bookmarks, 'Desktop operations preserve every bookmark field and order');
    assert.deepEqual(library.folders, original.folders, 'Desktop operations preserve all archive folders and membership');
    return library.desktopLayout;
  };
  const item = id => page.locator(`[data-active="true"] [data-desktop-id="${id}"]`);
  const group = page.getByRole('dialog', { name: '桌面文件夹', exact: true });
  const menu = page.getByRole('menu', { name: '桌面菜单', exact: true });
  const closeGroup = async () => {
    await group.getByRole('button', { name: '关闭', exact: true }).click();
    await group.waitFor({ state: 'hidden' });
  };
  const groupBookmarks = (layout, id) => layout.folders.find(folder => folder.id === id).shortcutIds
    .map(id => layout.shortcuts.find(shortcut => shortcut.id === id).bookmarkId);
  const legacyGroupId = converted.desktopLayout.folders[0].id;
  assert.notEqual(legacyGroupId, 'archive-child', 'Desktop group identity is independent');
  await item(legacyGroupId).click();
  await group.waitFor();
  assert.equal(await group.getByRole('textbox').count(), 0, 'Opening a folder shows contents, not a name editor');
  assert.equal(await group.locator('[data-folder-bookmark]').count(), 2, 'Folder opens as an icon grid');
  assert.equal(await group.getByRole('button', { name: '打开收藏：Site 0', exact: true }).count(), 1);
  assert.deepEqual(await read(), converted, 'Opening a folder does not mutate data');
  await group.locator('[data-folder-bookmark="b0"]').click({ button: 'right' });
  await page.getByRole('menu', { name: '文件夹图标菜单', exact: true })
    .getByRole('menuitem', { name: '在全部收藏中定位', exact: true }).click();
  await group.waitFor({ state: 'hidden' });
  await page.getByRole('main').getByText('Site 0', { exact: true }).waitFor();
  assert.deepEqual(await read(), converted, 'Reveal from a folder does not mutate bookmarks or layout');
  await page.getByTitle('点击返回首页桌面').click();
  await item(legacyGroupId).click();
  await group.getByRole('button', { name: '管理文件夹', exact: true }).click();
  await group.getByLabel('桌面文件夹名称', { exact: true }).fill('Work group');
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  });
  await group.getByRole('button', { name: '重命名', exact: true }).click();
  await group.getByRole('alert').waitFor();
  assert.equal(await group.getByLabel('桌面文件夹名称', { exact: true }).inputValue(), 'Work group');
  assert.equal((await invariant()).folders[0].name, 'Legacy desktop group');
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  await group.getByRole('button', { name: '重命名', exact: true }).click();
  assert.equal((await invariant()).folders[0].name, 'Work group');
  assert.equal(await group.getByRole('button', { name: /上移：|下移：/ }).count(), 0,
    'Folder management contains no per-icon reorder buttons');
  await group.getByRole('button', { name: '返回文件夹', exact: true }).click();
  const folderIcon = id => group.locator(`[data-folder-bookmark="${id}"]`);
  const beforeIconRemoval = await read();
  await folderIcon('b0').click({ button: 'right' });
  const folderMenu = page.getByRole('menu', { name: '文件夹图标菜单', exact: true });
  await folderMenu.getByRole('menuitem', { name: '复制网址', exact: true }).waitFor();
  assert.equal(await folderMenu.getByRole('menuitem', { name: '在全部收藏中定位', exact: true }).innerText(),
    '在全部收藏中定位\n全部收藏 / Original archive / Legacy desktop group',
    'Folder icon reveal uses the original archive path, not the desktop folder name');
  assert.ok(await folderMenu.getByRole('separator').count() >= 3, 'Folder menu groups match desktop icon actions');
  assert.equal(await folderMenu.getByRole('menuitem', { name: '删除收藏…', exact: true })
    .evaluate(element => element.classList.contains('text-rose-600')), true,
  'Permanent deletion has the same warning treatment as desktop');
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: `${screenshots}/folder-icon-menu.png` });
  await folderMenu.getByRole('menuitem', { name: '从桌面移除', exact: true }).click();
  const shortcutConfirmation = page.getByRole('alertdialog', { name: '从桌面移除', exact: true });
  await shortcutConfirmation.waitFor();
  assert.deepEqual(await read(), beforeIconRemoval, 'Shortcut removal waits for confirmation');
  await page.keyboard.press('Escape');
  await group.waitFor();
  assert.equal(await shortcutConfirmation.count(), 0, 'Escape dismisses the confirmation without closing the folder');
  await folderIcon('b0').dragTo(folderIcon('b1'), { targetPosition: { x: 90, y: 30 } });
  assert.deepEqual(groupBookmarks(await invariant(), legacyGroupId), ['b1', 'b0']);
  await group.getByText('添加已有收藏', { exact: true }).click();
  await group.getByRole('checkbox', { name: /Site 2/ }).check();
  await group.getByRole('checkbox', { name: /Site 3/ }).check();
  await group.getByRole('button', { name: '添加所选收藏 (2)', exact: true }).click();
  await folderIcon('b3').waitFor();
  assert.deepEqual(groupBookmarks(await invariant(), legacyGroupId), ['b1', 'b0', 'b2', 'b3']);
  const beforeDragOut = await invariant();
  const outside = { x: 1150, y: 400 };
  await startDrag(page, folderIcon('b0'), outside);
  await page.getByTestId('desktop-drag-preview').waitFor();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await group.waitFor();
  assert.deepEqual(await invariant(), beforeDragOut, 'Canceling a drag out restores the folder without changing data');
  await startDrag(page, folderIcon('b0'), outside);
  await page.getByTestId('desktop-drag-preview').waitFor();
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  });
  const failureTarget = await item('b4').boundingBox();
  await page.mouse.move(failureTarget.x - 8, failureTarget.y + 30, { steps: 10 });
  await page.mouse.move(failureTarget.x - 8, failureTarget.y + 30);
  await page.getByTestId('desktop-drop-slot').waitFor();
  await page.mouse.up();
  await group.waitFor();
  await group.getByRole('alert').filter({ hasText: '空间不足' }).waitFor();
  assert.deepEqual(await invariant(), beforeDragOut, 'Failed drag-out save keeps the original folder membership');
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  await startDrag(page, folderIcon('b0'), outside);
  await page.getByTestId('desktop-drag-preview').waitFor();
  const rootTarget = await item('b4').boundingBox();
  await page.mouse.move(rootTarget.x - 8, rootTarget.y + 30, { steps: 10 });
  await page.mouse.move(rootTarget.x - 8, rootTarget.y + 30);
  await page.getByTestId('desktop-drop-slot').waitFor();
  await page.screenshot({ path: `${screenshots}/folder-drag-out.png` });
  await page.mouse.up();
  await group.waitFor({ state: 'hidden' });
  await item('b0').waitFor();
  assert.deepEqual(groupBookmarks(await invariant(), legacyGroupId), ['b1', 'b2', 'b3']);

  const createFolder = page.getByRole('dialog', { name: '新建桌面文件夹', exact: true });
  const folderName = createFolder.getByRole('textbox', { name: '文件夹名称', exact: true });
  const beforeCancel = await invariant();
  await page.getByTitle('新建桌面文件夹', { exact: true }).click();
  assert.deepEqual(nativePrompts, [], 'Creating desktop folders never opens a native browser prompt');
  await createFolder.waitFor();
  assert.equal(await folderName.inputValue(), '新建文件夹');
  assert.equal(await folderName.evaluate(input => document.activeElement === input
    && input.selectionStart === 0 && input.selectionEnd === input.value.length), true,
  'Default name is focused and selected');
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: `${screenshots}/desktop-create-folder.png`, fullPage: true });
  await folderName.fill('Canceled');
  await page.keyboard.press('Escape');
  await createFolder.waitFor({ state: 'hidden' });
  assert.deepEqual(await invariant(), beforeCancel, 'Canceling folder creation preserves the layout');
  assert.equal(await page.getByTitle('新建桌面文件夹', { exact: true }).evaluate(button => document.activeElement === button), true,
    'Canceling restores focus to the toolbar trigger');

  for (const [width, height, en] of [[390, 844, false], [320, 740, true]]) {
    await page.getByRole('banner').getByRole('button', { name: en ? '切换日间模式' : '切换夜间模式', exact: true }).click();
    if (en) await page.getByRole('banner').getByRole('button', { name: '切换为英文', exact: true }).click();
    await page.setViewportSize({ width, height });
    await page.getByTitle(en ? 'New desktop folder' : '新建桌面文件夹', { exact: true }).click();
    const narrowDialog = page.getByRole('dialog', { name: en ? 'New desktop folder' : '新建桌面文件夹', exact: true });
    const narrowName = narrowDialog.getByRole('textbox', { name: en ? 'Folder name' : '文件夹名称', exact: true });
    await narrowDialog.waitFor();
    assert.equal(await narrowName.inputValue(), en ? 'New folder' : '新建文件夹');
    const rect = await narrowDialog.boundingBox();
    const dockRect = await page.getByTestId('bottom-dock').boundingBox();
    assert.ok(rect.x >= 0 && rect.x + rect.width <= width && rect.y >= 0
      && rect.y + rect.height <= dockRect.y, 'Create dialog fits the viewport above the Dock');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (let index = 0; index < 5; index++) {
      await page.keyboard.press('Tab');
      assert.equal(await narrowDialog.evaluate(element => element.contains(document.activeElement)), true);
    }
    await page.screenshot({ path: `${screenshots}/desktop-create-folder-${width}.png`, fullPage: true });
    await narrowDialog.getByRole('button', { name: en ? 'Cancel' : '取消', exact: true }).click();
    assert.deepEqual(await invariant(), beforeCancel);
  }
  await page.getByRole('banner').getByRole('button', { name: 'Switch to Chinese', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });

  await item('b0').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: '新建分组并移入…', exact: true }).click();
  await createFolder.waitFor();
  await folderName.fill('   ');
  assert.equal(await createFolder.getByRole('button', { name: '创建文件夹', exact: true }).isDisabled(), true);
  await folderName.fill('Research');
  const beforeCreate = await invariant();
  const imeProtection = await folderName.evaluate(input => {
    const events = [{ isComposing: true }, { keyCode: 229 }].map(flags => {
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...flags });
      input.dispatchEvent(event);
      return event.defaultPrevented;
    });
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.form.requestSubmit();
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    return events;
  });
  assert.deepEqual(imeProtection, [true, true], 'IME confirmation never submits the create form');
  assert.deepEqual(await invariant(), beforeCreate);
  assert.equal(await createFolder.count(), 1);
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  });
  await createFolder.getByRole('button', { name: '创建文件夹', exact: true }).click();
  await createFolder.getByRole('alert').waitFor();
  assert.equal(await folderName.inputValue(), 'Research', 'Failed creation retains the name');
  assert.deepEqual(await invariant(), beforeCreate, 'Failed creation cannot partially move shortcuts');
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  await folderName.press('Enter');
  await createFolder.waitFor({ state: 'hidden' });
  let layout = await invariant();
  const researchId = layout.folders.find(folder => folder.name === 'Research').id;
  assert.deepEqual(groupBookmarks(layout, researchId), ['b0']);
  await item(legacyGroupId).click();
  await startDrag(page, folderIcon('b1'), outside);
  await page.getByTestId('desktop-drag-preview').waitFor();
  const researchBounds = await item(researchId).boundingBox();
  await page.mouse.move(researchBounds.x + 48, researchBounds.y + 32, { steps: 10 });
  await page.mouse.move(researchBounds.x + 48, researchBounds.y + 32);
  await page.waitForFunction(id =>
    document.querySelector(`[data-desktop-id="${id}"]`)?.getAttribute('data-drop-state') === 'merge', researchId);
  await page.mouse.up();
  assert.deepEqual(groupBookmarks(await invariant(), researchId), ['b0', 'b1']);
  await group.waitFor({ state: 'hidden' });

  // Mixed root order: a folder can move alongside shortcuts without nesting.
  await item(researchId).dragTo(item('b4'), { targetPosition: { x: 4, y: 30 } });
  layout = await invariant();
  const index = layout.root.findIndex(ref => ref.id === researchId);
  assert.equal(layout.shortcuts.find(shortcut => shortcut.id === layout.root[index + 1]?.id)?.bookmarkId, 'b4');
  const beforeDissolve = layout.root;
  const position = beforeDissolve.findIndex(ref => ref.id === legacyGroupId);
  const groupRefs = layout.folders.find(folder => folder.id === legacyGroupId).shortcutIds
    .map(id => ({ kind: 'shortcut', id }));
  await item(legacyGroupId).click({ button: 'right' });
  await menu.getByRole('menuitem', { name: '解散桌面文件夹', exact: true }).click();
  await page.getByRole('alertdialog', { name: '确认移除桌面文件夹', exact: true }).waitFor();
  assert.deepEqual(await invariant(), layout, 'Desktop context menu dissolution waits for bubble confirmation');
  await page.mouse.click(20, 400);
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  assert.deepEqual(await invariant(), layout, 'Clicking outside confirmation cancels without data changes');
  await item(legacyGroupId).click();
  await group.getByRole('button', { name: '管理文件夹', exact: true }).click();
  await group.getByRole('button', { name: '解散桌面文件夹', exact: true }).click();
  const confirmation = page.getByRole('alertdialog', { name: '确认移除桌面文件夹', exact: true });
  await confirmation.waitFor();
  const confirmationBounds = await confirmation.boundingBox();
  assert.ok(confirmationBounds.width <= 320 && confirmationBounds.x >= 0
    && confirmationBounds.x + confirmationBounds.width <= 1440, 'Confirmation is a bounded anchored bubble');
  await page.screenshot({ path: `${screenshots}/folder-confirm-light.png` });
  await page.evaluate(() => document.documentElement.classList.add('dark', 'dark-glass'));
  await page.screenshot({ path: `${screenshots}/folder-confirm-dark.png` });
  await page.evaluate(() => document.documentElement.classList.remove('dark', 'dark-glass'));
  assert.deepEqual(await invariant(), layout, 'Opening a destructive confirmation does not modify data');
  await page.keyboard.press('Escape');
  await confirmation.waitFor({ state: 'hidden' });
  await group.waitFor();
  await group.getByRole('button', { name: '解散桌面文件夹', exact: true }).click();
  await confirmation.getByRole('button', { name: '确认解散', exact: true }).click();
  await group.waitFor({ state: 'hidden' });
  layout = await invariant();
  assert.deepEqual(layout.root, [...beforeDissolve.slice(0, position), ...groupRefs, ...beforeDissolve.slice(position + 1)],
    'Dissolve restores shortcuts exactly at the folder position in relative order');
  await item(researchId).click();
  await group.getByRole('button', { name: '管理文件夹', exact: true }).click();
  await group.getByRole('button', { name: '移除桌面文件夹及快捷方式…', exact: true }).click();
  await confirmation.getByText(/其中 2 个桌面快捷方式/).waitFor();
  await confirmation.getByRole('button', { name: '确认移除快捷方式', exact: true }).click();
  await group.waitFor({ state: 'hidden' });
  layout = await invariant();
  assert.ok(!layout.shortcuts.some(shortcut => ['b0', 'b1'].includes(shortcut.bookmarkId)));

  // Re-pin from the library without changing archive metadata.
  await page.getByRole('banner').getByRole('button', { name: '管理中心', exact: true }).click();
  const filter = page.getByPlaceholder('按名称、网址或关键词搜索...');
  await filter.fill('Site 0');
  await page.getByTitle('固定到桌面').click();
  await invariant();
  await page.getByTitle('点击返回首页桌面').click();
  await item('b0').waitFor();
  await page.getByTitle('新建桌面文件夹', { exact: true }).click();
  await createFolder.waitFor();
  await folderName.fill(' Daily ');
  await createFolder.getByRole('button', { name: '创建文件夹', exact: true }).click();
  await createFolder.waitFor({ state: 'hidden' });
  layout = await invariant();
  const dailyId = layout.folders.find(folder => folder.name === 'Daily').id;
  await item('b0').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: '移至桌面文件夹…', exact: true }).click();
  const move = page.getByRole('dialog', { name: '移动桌面快捷方式', exact: true });
  await move.getByLabel('目标桌面文件夹', { exact: true }).selectOption(dailyId);
  await move.getByRole('button', { name: '移动', exact: true }).click();
  assert.deepEqual(groupBookmarks(await invariant(), dailyId), ['b0']);
  await item(dailyId).click();
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: `${screenshots}/desktop-folder-dialog.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await group.waitFor();
  await group.getByRole('button', { name: '管理文件夹', exact: true }).click();
  await group.getByRole('button', { name: '解散桌面文件夹', exact: true }).click();
  const mobileConfirmation = await confirmation.boundingBox();
  assert.ok(mobileConfirmation.x >= 0 && mobileConfirmation.x + mobileConfirmation.width <= 390
    && mobileConfirmation.y >= 0 && mobileConfirmation.y + mobileConfirmation.height <= 844,
  'Confirmation fits the mobile viewport');
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  await group.getByRole('button', { name: '返回文件夹', exact: true }).click();
  const bounds = await group.boundingBox();
  const dock = await page.getByTestId('bottom-dock').boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391, 'Folder dialog fits mobile width');
  assert.ok(bounds.y + bounds.height <= dock.y, 'Folder dialog remains above the Dock');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `${screenshots}/desktop-folder-mobile.png`, fullPage: true });
  await page.keyboard.press('Tab');
  assert.equal(await group.evaluate(element => element.contains(document.activeElement)), true, 'Dialog retains keyboard focus');
  await page.keyboard.press('Escape');
  await group.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await item(dailyId).click();
  await group.getByRole('button', { name: '添加新网址', exact: true }).click();
  const quickAdd = page.getByRole('dialog').filter({ has: page.getByLabel('网址 URL', { exact: true }) });
  await quickAdd.getByLabel('网址 URL', { exact: true }).fill('https://example.org/new-in-group');
  await quickAdd.getByLabel('网站名称', { exact: true }).fill('New in group');
  await quickAdd.getByRole('button', { name: /^收藏位置 / }).click();
  await quickAdd.getByRole('button', { name: '展开: Original archive', exact: true }).click();
  await quickAdd.getByRole('treeitem', { name: /Legacy desktop group$/ }).click();
  await quickAdd.getByLabel('同时固定到桌面文件夹「Daily」', { exact: true }).check();
  const beforeAdd = await read();
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  });
  await quickAdd.getByRole('button', { name: '添加收藏', exact: true }).click();
  await quickAdd.getByRole('alert').waitFor();
  assert.deepEqual(await read(), beforeAdd, 'Failed quick-add cannot save only the bookmark or shortcut');
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  await quickAdd.getByRole('button', { name: '添加收藏', exact: true }).click();
  await quickAdd.waitFor({ state: 'hidden' });
  const added = await read();
  const bookmark = added.bookmarks.find(bookmark => bookmark.title === 'New in group');
  assert.equal(bookmark.folderId, 'archive-child');
  assert.ok(groupBookmarks(added.desktopLayout, dailyId).includes(bookmark.id));
  assert.deepEqual(added.bookmarks.filter(item => item.id !== bookmark.id), original.bookmarks);
  await page.reload();
  await item(dailyId).click();
  const folderWebsite = group.getByRole('button', { name: '打开收藏：New in group', exact: true });
  await folderWebsite.waitFor();
  assert.equal(await group.getByRole('textbox').count(), 0, 'Reopening a folder always starts in browsing mode');
  const folderPopupPromise = context.waitForEvent('page', { timeout: 5000 });
  await folderWebsite.click();
  const folderPopup = await folderPopupPromise;
  await folderPopup.waitForLoadState();
  assert.equal(folderPopup.url(), 'https://example.org/new-in-group', 'Clicking a folder website opens its URL');
  await folderPopup.close();
  await closeGroup();
  await page.getByRole('banner').getByRole('button', { name: '管理中心', exact: true }).click();
  await filter.fill('New in group');
  await page.getByTitle('删除收藏…').click();
  await page.getByRole('button', { name: '移至回收站', exact: true }).click();
  await page.getByRole('dialog', { name: '删除收藏？', exact: true }).waitFor({ state: 'hidden' });
  const deleted = await read();
  assert.ok(!deleted.bookmarks.some(item => item.id === bookmark.id));
  assert.ok(!deleted.desktopLayout.shortcuts.some(item => item.bookmarkId === bookmark.id),
    'Source bookmark deletion prunes shortcut references inside desktop groups');
  await page.getByTitle('点击返回首页桌面').click();
  await page.getByRole('button', { name: '编辑桌面', exact: true }).click();
  await item('b5').press('Enter');
  await item('b6').press('Enter');
  await page.getByTitle('成组为文件夹', { exact: true }).click();
  await createFolder.waitFor();
  await createFolder.getByText('移入 2 个快捷方式', { exact: true }).waitFor();
  const beforeMultiCancel = await invariant();
  await createFolder.getByRole('button', { name: '取消', exact: true }).click();
  assert.deepEqual(await invariant(), beforeMultiCancel, 'Canceling grouping preserves all selected shortcuts');
  assert.equal(await page.getByTitle('成组为文件夹', { exact: true }).innerText(), '2');
  await page.getByTitle('成组为文件夹', { exact: true }).click();
  await folderName.fill('Quick group');
  await folderName.press('Enter');
  await createFolder.waitFor({ state: 'hidden' });
  const multiLayout = await invariant();
  const multiFolder = multiLayout.folders.find(folder => folder.name === 'Quick group');
  assert.deepEqual(groupBookmarks(multiLayout, multiFolder.id), ['b5', 'b6']);
  assert.equal(await page.getByRole('button', { name: '编辑桌面', exact: true }).count(), 1);
  assert.deepEqual(nativePrompts, []);
  const externalRaw = await page.evaluate(() => {
    const library = JSON.parse(localStorage.getItem('jipage_library_v2'));
    library.bookmarks[0].notes = 'Saved from another page';
    const raw = JSON.stringify(library);
    localStorage.setItem('jipage_library_v2', raw);
    return raw;
  });
  const popupPromise = context.waitForEvent('page', { timeout: 5000 });
  await item('b4').click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  assert.equal(popup.url(), 'https://example.org/4', 'Visit statistics conflict cannot block URL navigation');
  await popup.close();
  assert.equal(await page.evaluate(() => localStorage.getItem('jipage_library_v2')), externalRaw,
    'Failed visit statistics cannot overwrite another page changes');
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: `${screenshots}/desktop-folders.png`, fullPage: true });
  assert.deepEqual(errors, []);
  const corruptRaw = await page.evaluate(() => {
    const library = JSON.parse(localStorage.getItem('jipage_library_v2'));
    library.desktopLayout.root.push({ kind: 'shortcut', id: 'missing-shortcut' });
    const raw = JSON.stringify(library);
    localStorage.setItem('jipage_library_v2', raw);
    return raw;
  });
  await page.reload();
  await page.getByRole('alert').filter({ hasText: '本机数据暂时无法读取' }).waitFor();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载原始数据备份', exact: true }).click();
  const download = await downloadPromise;
  assert.ok(download.suggestedFilename().endsWith('.json'));
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const backup = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.equal(backup.data.jipage_library_v2, corruptRaw, 'Emergency download includes unchanged raw bytes');
  assert.equal(await page.evaluate(() => localStorage.getItem('jipage_library_v2')), corruptRaw,
    'Corrupt layout fallback and raw export never replace or clear source data');
  console.log('PASS: folder icon context menus, native reorder, canceled/failed/successful drag-out, drag to another folder, compact management, light/dark/mobile confirmation bubbles; initial batch/quota retry, immutable archive, mobile focus, quick-add, reload/deletion pruning and corrupt-data backup');
} finally {
  await browser?.close();
  await server.close();
}
