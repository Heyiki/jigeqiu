import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = await mkdtemp(path.join(os.tmpdir(), 'jigeqiu-bookmark-source-extension-'));
const profile = await mkdtemp(path.join(os.tmpdir(), 'jigeqiu-bookmark-source-profile-'));
const source = path.join(root, 'dist-extension');
let context;
try {
  await cp(source, fixture, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(fixture, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.optional_permissions, ['bookmarks']);
  assert.equal(manifest.permissions.includes('bookmarks'), false);
  // Test installation only: avoids a native permission prompt in headless Chromium.
  // The production manifest remains optional; rejection is exercised in the real settings UI below.
  manifest.permissions.push('bookmarks');
  delete manifest.optional_permissions;
  await writeFile(path.join(fixture, 'manifest.json'), JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, locale: 'en-US',
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${fixture}`, `--load-extension=${fixture}`],
  });
  await context.route(/^https?:/, route => route.abort());
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const baseURL = worker.url().replace(/background\.js$/, 'index.html');
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(15000);
  await page.goto(baseURL);
  await page.getByRole('heading', { name: 'Privacy before you begin', exact: true }).waitFor();
  const privacyVersion = (await readFile(path.join(root, 'extension/privacy/content.ts'), 'utf8')).match(/PRIVACY_VERSION = '([^']+)'/)[1];
  await page.evaluate(async version => {
    const api = globalThis.chrome;
    const key = 'jigeqiu-extension-state-v1';
    const state = (await api.storage.local.get(key))[key];
    state.data['jigeqiu-extension-privacy-acknowledged'] = version;
    state.data.jigeqiu_onboarding_v1 = JSON.stringify({ version: 1, welcomeShown: true, welcomeSkipped: true, tourCompleted: true, tasks: { import: false, add: false, pin: false }, backupReminderShown: true });
    // First-install settings have no saved Dock; do not mask the virtual settings round-trip.
    state.data.jipage_settings_v1 = JSON.stringify({ language: 'en' });
    state.data.jipage_library_v2 = JSON.stringify({ version: 1, bookmarks: [{ id: 'local-original', title: 'Extension original', url: 'https://local-original.test/', domain: 'local-original.test', category: 'cat-inbox', collectionIds: [], pinnedToDesktop: false, order: 0, createdAt: 1, updatedAt: 1 }], folders: [] });
    state.revision++;
    await api.storage.local.set({ [key]: state });
    const tree = await api.bookmarks.getTree();
    const bar = tree[0].children.find(node => node.folderType === 'bookmarks-bar') ?? tree[0].children.find(node => node.id === '1');
    await api.bookmarks.create({ parentId: bar.id, title: 'Browser original', url: 'https://browser-original.test/' });
    const folder = await api.bookmarks.create({ parentId: bar.id, title: 'Native folder' });
    await api.bookmarks.create({ parentId: folder.id, title: 'Native nested', url: 'https://native-nested.test/' });
    const other = tree[0].children.find(node => node.id !== bar.id);
    await api.bookmarks.create({ parentId: other.id, title: 'Outside the bar', url: 'https://outside-bar.test/' });
  }, privacyVersion);
  await page.goto(`${baseURL}#/library`);
  await page.getByText('Extension original', { exact: true }).waitFor();
  const readData = () => page.evaluate(async () => (await globalThis.chrome.storage.local.get('jigeqiu-extension-state-v1'))['jigeqiu-extension-state-v1'].data);
  const original = (await readData()).jipage_library_v2;
  const stale = await context.newPage();
  await stale.goto(`${baseURL}#/library`);
  await stale.getByText('Extension original', { exact: true }).waitFor();

  // Denial retains the current source and its data; the user can try again.
  await page.evaluate(() => {
    globalThis.savedPermissionRequest = globalThis.chrome.permissions.request.bind(globalThis.chrome.permissions);
    globalThis.chrome.permissions.request = async () => false;
  });
  await page.getByRole('button', { name: 'Browser bookmarks', exact: true }).click();
  let confirmation = page.getByRole('dialog', { name: 'Switch to browser bookmarks?', exact: true });
  await confirmation.getByRole('button', { name: 'Confirm switch', exact: true }).click();
  await confirmation.getByRole('alert').waitFor();
  assert.equal((await readData()).jipage_bookmark_source_v1, undefined);
  await page.evaluate(() => { globalThis.chrome.permissions.request = globalThis.savedPermissionRequest; });
  await confirmation.getByRole('button', { name: 'Confirm switch', exact: true }).click();
  await page.getByText('Browser original', { exact: true }).waitFor();
  await stale.getByRole('dialog', { name: 'Check the bookmark source', exact: true }).waitFor();
  assert.equal(await page.getByText('Extension original', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Outside the bar', { exact: true }).count(), 0);
  assert.equal((await readData()).jipage_library_v2, original);

  // Changing the location appends to native siblings instead of reusing the old index.
  const originalRow = page.locator('[data-library-bookmark]').filter({ hasText: 'Browser original' });
  await originalRow.getByRole('button', { name: 'Edit bookmark', exact: true }).click();
  const mover = page.getByRole('dialog', { name: 'Edit bookmark', exact: true });
  await mover.getByRole('button', { name: /^Bookmark location/ }).click();
  await mover.getByRole('treeitem', { name: 'Library root / Native folder', exact: true }).click();
  await mover.getByRole('button', { name: 'Save changes', exact: true }).click();
  await mover.waitFor({ state: 'hidden' });
  assert.deepEqual(await page.evaluate(async () => {
    const folder = (await globalThis.chrome.bookmarks.search({ title: 'Native folder' }))[0];
    return (await globalThis.chrome.bookmarks.getChildren(folder.id)).map(item => item.title);
  }), ['Native nested', 'Browser original']);

  const nativeBeforeAppearance = await page.evaluate(() => globalThis.chrome.bookmarks.getTree());
  await page.evaluate(() => { location.hash = '#/settings/appearance'; });
  const night = page.getByRole('button', { name: 'Select appearance: Night mode', exact: true });
  await night.click();
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await page.getByRole('button', { name: 'Select wallpaper: Green mountain reflections', exact: true }).click();
  await page.waitForFunction(async () => {
    const state = (await globalThis.chrome.storage.local.get('jigeqiu-extension-state-v1'))['jigeqiu-extension-state-v1'];
    const settings = JSON.parse(state.data.jipage_settings_v1);
    return settings.appearanceMode === 'dark-glass' && settings.wallpaperPreset === 'green-lake';
  });
  assert.equal(await page.getByRole('dialog', { name: 'Check the bookmark source', exact: true }).count(), 0);
  assert.deepEqual(await page.evaluate(() => globalThis.chrome.bookmarks.getTree()), nativeBeforeAppearance);
  await page.reload();
  assert.equal(await night.getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => { location.hash = '#/library'; });
  await page.getByText('Browser original', { exact: true }).waitFor();

  const add = async (title, url) => {
    await page.getByRole('button', { name: 'Add bookmark to this folder', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Add bookmark', exact: true });
    await form.locator('[data-bookmark-source="browser"]').waitFor();
    await form.getByLabel('Website URL', { exact: true }).fill(url);
    await form.getByLabel('Website name', { exact: true }).fill(title);
    await form.getByRole('checkbox', { name: 'Also pin to desktop', exact: true }).check();
    await form.getByRole('button', { name: 'Add bookmark', exact: true }).click();
    await form.waitFor({ state: 'hidden' });
  };
  await add('Added in extension', 'https://added-in-extension.test/');
  assert.equal(await page.evaluate(async () => (await globalThis.chrome.bookmarks.search({ url: 'https://added-in-extension.test/' })).length), 1);
  const row = page.locator('[data-library-bookmark]').filter({ hasText: 'Added in extension' });
  await row.getByRole('button', { name: 'Edit bookmark', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit bookmark', exact: true });
  await editor.getByLabel('Website name', { exact: true }).fill('Edited in extension');
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(async () => (await globalThis.chrome.bookmarks.search({ url: 'https://added-in-extension.test/' }))[0].title), 'Edited in extension');
  const browserCache = JSON.parse((await readData()).jipage_browser_library_v1);
  assert.ok(browserCache.desktopLayout.shortcuts.length);

  await page.evaluate(async () => {
    const bookmark = (await globalThis.chrome.bookmarks.search({ url: 'https://browser-original.test/' }))[0];
    await globalThis.chrome.bookmarks.update(bookmark.id, { title: 'Changed in browser' });
  });
  await page.getByText('Changed in browser', { exact: true }).waitFor();
  await page.locator('[data-library-bookmark]').filter({ hasText: 'Edited in extension' }).getByRole('button', { name: 'Delete bookmark…', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete bookmark?', exact: true }).getByRole('button', { name: 'Move to recycle bin', exact: true }).click();
  await page.getByText('Edited in extension', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(async () => (await globalThis.chrome.bookmarks.search({ url: 'https://added-in-extension.test/' })).length), 0);

  // The production right-click handler opens a capture that follows the active source.
  const [capture] = await Promise.all([context.waitForEvent('page'), page.evaluate(async () => {
    const { captureCurrentPage } = await import(globalThis.chrome.runtime.getURL('background.js'));
    const parent = await globalThis.chrome.windows.getCurrent();
    await globalThis.chrome.windows.update(parent.id, { left: 0, top: 0, width: 1000, height: 700 });
    await captureCurrentPage({ url: 'https://captured-to-browser.test/', title: 'Browser capture', windowId: parent.id });
  })]);
  await capture.getByRole('dialog', { name: 'Add bookmark', exact: true }).waitFor();
  await capture.locator('[data-bookmark-source="browser"]').waitFor();
  await Promise.all([capture.waitForEvent('close'), capture.getByRole('button', { name: 'Add bookmark', exact: true }).click()]);
  assert.equal(await page.evaluate(async () => (await globalThis.chrome.bookmarks.search({ url: 'https://captured-to-browser.test/' })).length), 1);

  // Switch away, modify the browser, then return without merging or resurrecting data.
  await page.getByRole('button', { name: 'Extension bookmarks', exact: true }).click();
  await page.getByRole('dialog', { name: 'Switch to extension bookmarks?', exact: true }).getByRole('button', { name: 'Confirm switch', exact: true }).click();
  await page.getByText('Extension original', { exact: true }).waitFor();
  assert.equal((await readData()).jipage_library_v2, original);
  await page.evaluate(async () => {
    const bookmark = (await globalThis.chrome.bookmarks.search({ url: 'https://browser-original.test/' }))[0];
    await globalThis.chrome.bookmarks.update(bookmark.id, { title: 'Changed while disconnected' });
  });
  await page.getByRole('button', { name: 'Browser bookmarks', exact: true }).click();
  await page.getByRole('dialog', { name: 'Switch to browser bookmarks?', exact: true }).getByRole('button', { name: 'Confirm switch', exact: true }).click();
  await page.getByText('Changed while disconnected', { exact: true }).waitFor();
  assert.equal(await page.getByText('Edited in extension', { exact: true }).count(), 0);
  assert.equal((await readData()).jipage_library_v2, original);
  assert.equal(await page.evaluate(async () => (await globalThis.chrome.bookmarks.search({ url: 'https://outside-bar.test/' })).length), 1);
  const screenshots = path.join(root, 'test-results/extension');
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, 'bookmark-source-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(screenshots, 'bookmark-source-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: bookmark source permission denial, switching, isolation, first-install appearance saves, CRUD, external events, capture and mobile layout');
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
  await rm(fixture, { recursive: true, force: true });
}
