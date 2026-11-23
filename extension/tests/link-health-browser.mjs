import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const extension = path.join(root, 'dist-extension');
const fixture = await mkdtemp(path.join(os.tmpdir(), 'jigeqiu-health-extension-'));
const profile = await mkdtemp(path.join(os.tmpdir(), 'jigeqiu-health-profile-'));
const requests = [];
const server = createServer((request, response) => {
  requests.push({ url: request.url, method: request.method, cookie: request.headers.cookie });
  if (request.url.startsWith('/redirect')) { response.writeHead(302, { location: '/ok' }); response.end(); return; }
  if (request.url.startsWith('/fallback') && request.method === 'HEAD') { response.writeHead(405); response.end(); return; }
  response.writeHead(request.url.startsWith('/bad') ? 404 : request.url.startsWith('/restricted') ? 403 : 200);
  response.end('small response');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let context;
try {
  await cp(extension, fixture, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(fixture, 'manifest.json'), 'utf8'));
  // Test-only installation grants; production keeps all host permissions optional.
  await writeFile(path.join(fixture, 'manifest.json'), JSON.stringify({ ...manifest, host_permissions: ['http://127.0.0.1/*'] }));
  context = await chromium.launchPersistentContext(profile, {
    channel: process.env.HEALTH_BROWSER_CHANNEL || 'chromium', headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${fixture}`, `--load-extension=${fixture}`],
  });
  await context.route(/^https?:/, route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await context.addInitScript(({ origin }) => {
    if (localStorage.getItem('health-seeded')) return;
    localStorage.setItem('health-seeded', 'yes');
    localStorage.setItem('jipage_settings_v1', JSON.stringify({ language: 'en', backgroundType: 'color' }));
    localStorage.setItem('jipage_folders_v1', JSON.stringify([
      { id: 'work', name: 'Work', order: 0 },
      { id: 'reading', name: 'Reading', parentId: 'work', order: 0 },
    ].map(folder => ({ ...folder, bookmarkIds: [], pinnedToDesktop: false, createdAt: 1, updatedAt: 1 }))));
    localStorage.setItem('jipage_bookmarks_v1', JSON.stringify(Array.from({ length: 125 }, (_, i) => ({
      id: `health-${i}`, title: i === 0 ? 'Healthy site' : i === 1 ? 'HEAD fallback site' : i === 2 ? 'Redirect site' : i === 3 ? 'Permission site' : `Broken site ${i}`,
      url: i === 3 ? 'https://ungranted.invalid/private' : `${origin}/${i === 0 ? 'ok' : i === 1 ? 'fallback' : i === 2 ? 'redirect' : i === 4 ? 'restricted' : 'bad'}/${i}`,
      folderId: i === 5 ? 'reading' : undefined,
      domain: '127.0.0.1', category: 'uncategorized', order: i, pinnedToDesktop: false, collectionIds: [], createdAt: 1, updatedAt: 1,
    }))));
  }, { origin });
  let page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(15000);
  await page.goto('chrome://newtab/');
  await page.getByRole('button', { name: 'Acknowledge and continue', exact: true }).click();
  const extensionUrl = await page.evaluate(() => globalThis.chrome.runtime.getURL('index.html'));
  await page.goto(`${extensionUrl}#/settings/link-health`);
  await page.getByRole('heading', { name: 'Link health check', exact: true, level: 1 }).waitFor();
  assert.equal(requests.some(request => /\/bad\//.test(request.url)), false, 'opening never scans');
  await page.getByRole('button', { name: /^Scan scope / }).click();
  await page.getByRole('searchbox', { name: 'Search folders', exact: true }).fill('Reading');
  await page.getByRole('treeitem', { name: 'All bookmarks / Work / Reading', exact: true }).click();
  await page.getByRole('button', { name: 'Start scan', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Site access for this scan', exact: true });
  await dialog.waitFor();
  await dialog.getByText('Check 1 bookmarks in the selected scope.', { exact: true }).waitFor();
  assert.equal(await dialog.locator('textarea').count(), 0, 'broad authorization explains scope without listing every site');
  await dialog.getByText(/all HTTP and HTTPS websites/).waitFor();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).last().click();
  assert.equal(requests.some(request => /\/bad\//.test(request.url)), false, 'cancel never scans');
  await page.getByRole('button', { name: /^Scan scope / }).click();
  await page.getByRole('treeitem', { name: 'All bookmarks', exact: true }).click();
  await page.evaluate(() => {
    globalThis.chrome.permissions.request = async permission => { globalThis.healthPermissionRequest = permission; return false; };
  });
  await page.getByRole('button', { name: 'Start scan', exact: true }).click();
  await dialog.getByRole('button', { name: 'Authorize and start', exact: true }).click();
  await dialog.getByText('Site access was not granted. No scan was started.', { exact: true }).waitFor();
  assert.equal(requests.some(request => /\/bad\//.test(request.url)), false, 'denying broad access never starts a scan');
  assert.deepEqual(await page.evaluate(() => globalThis.healthPermissionRequest.origins), ['http://*/*', 'https://*/*']);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).last().click();
  // Supply actual browser grants in a test-only manifest, then reopen the same profile.
  await context.close();
  await writeFile(path.join(fixture, 'manifest.json'), JSON.stringify({ ...manifest, host_permissions: ['http://*/*', 'https://*/*'] }));
  context = await chromium.launchPersistentContext(profile, {
    channel: process.env.HEALTH_BROWSER_CHANNEL || 'chromium', headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${fixture}`, `--load-extension=${fixture}`],
  });
  await context.route(/^https?:/, route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${extensionUrl}#/settings/link-health`);
  await page.getByRole('button', { name: 'Start scan', exact: true }).click();
  assert.equal(await page.getByRole('dialog', { name: 'Site access for this scan', exact: true }).count(), 0, 'existing broad access needs no repeated prompt');
  await page.getByText('Scan complete', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-health-row]').count(), 15, 'default page mounts fifteen anomalies');
  assert.equal(await page.getByText('Healthy site', { exact: true }).count(), 0);
  assert.equal(await page.getByText('HEAD fallback site', { exact: true }).count(), 0);
  await page.evaluate(() => document.documentElement.classList.add('dark', 'dark-glass'));
  for (const name of ['Anomaly category']) {
    const select = page.getByRole('combobox', { name, exact: true });
    const colors = await select.evaluate(element => ({ scheme: getComputedStyle(element).colorScheme,
      foreground: getComputedStyle(element.options[0]).color, background: getComputedStyle(element.options[0]).backgroundColor }));
    assert.equal(colors.scheme, 'dark');
    assert.notEqual(colors.background, 'rgba(0, 0, 0, 0)');
    assert.notEqual(colors.foreground, colors.background);
  }
  const scope = page.getByRole('button', { name: /^Scan scope / });
  await scope.click();
  const tree = page.getByRole('tree', { name: 'Scan scope', exact: true });
  await tree.waitFor();
  const treeColors = await tree.evaluate(element => {
    const style = getComputedStyle(element.parentElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = style.color;
    ctx.fillRect(0, 0, 1, 1);
    return { background: style.backgroundColor, foreground: style.color, textRgb: [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3) };
  });
  assert.notEqual(treeColors.background, 'rgba(0, 0, 0, 0)');
  assert.notEqual(treeColors.background, treeColors.foreground);
  assert.ok(treeColors.textRgb.every(channel => channel > 200), 'dark tree uses light readable text');
  await page.getByRole('searchbox', { name: 'Search folders', exact: true }).fill('No matching folder');
  await tree.getByRole('treeitem', { name: 'All bookmarks', exact: true }).click();
  const pageSizes = page.getByRole('combobox', { name: 'Rows per page', exact: true });
  await pageSizes.scrollIntoViewIfNeeded();
  await pageSizes.click();
  const sizeMenu = page.getByRole('listbox', { name: 'Rows per page', exact: true });
  await sizeMenu.waitFor({ timeout: 2000 });
  assert.equal(await sizeMenu.getByRole('option').count(), 4);
  await page.screenshot({ path: '/tmp/jigeqiu-pagination-menu-dark.png' });
  await sizeMenu.getByRole('option', { name: '30 per page', exact: true }).click();
  assert.equal(await page.locator('[data-health-row]').count(), 30);
  await pageSizes.press('ArrowUp');
  await pageSizes.press('Enter');
  assert.equal(await page.locator('[data-health-row]').count(), 15);
  await pageSizes.click();
  await pageSizes.press('Escape');
  assert.equal(await sizeMenu.count(), 0);
  await page.screenshot({ path: '/tmp/jigeqiu-health-dark.png' });
  const shortLink = page.locator('[data-health-row] a').first();
  await shortLink.scrollIntoViewIfNeeded();
  const hitArea = await shortLink.evaluate(anchor => {
    const box = anchor.getBoundingClientRect();
    const icon = anchor.querySelector('svg').getBoundingClientRect();
    const parent = anchor.parentElement.getBoundingClientRect();
    const blank = document.elementFromPoint((box.right + parent.right) / 2, box.y + box.height / 2);
    return { width: box.width, parentWidth: parent.width, rightGap: Math.abs(box.right - icon.right), blankIsLink: !!blank?.closest('a') };
  });
  assert.ok(hitArea.width < hitArea.parentWidth / 2, 'short links fit their content');
  assert.ok(hitArea.rightGap < 1, 'link ends at the external-link icon');
  assert.equal(hitArea.blankIsLink, false, 'blank space cannot open the link');
  await page.setViewportSize({ width: 320, height: 844 });
  await pageSizes.scrollIntoViewIfNeeded();
  await pageSizes.click();
  const menuBox = await sizeMenu.boundingBox();
  assert.ok(menuBox.x >= 0 && menuBox.x + menuBox.width <= 320);
  assert.ok(menuBox.y >= 0 && menuBox.y + menuBox.height <= 844);
  await page.screenshot({ path: '/tmp/jigeqiu-pagination-menu-mobile.png' });
  await pageSizes.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('searchbox', { name: 'Search abnormal links', exact: true }).fill('Broken site 5');
  await page.getByRole('checkbox', { name: 'Select Broken site 5', exact: true }).check();
  await page.getByRole('button', { name: 'Move selected to recycle bin', exact: true }).click();
  const trash = page.getByRole('dialog', { name: 'Move links to recycle bin', exact: true });
  await trash.getByRole('button', { name: 'Move to recycle bin', exact: true }).click();
  await page.getByText('Broken site 5', { exact: true }).waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/jigeqiu-health-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('searchbox', { name: 'Search abnormal links', exact: true }).fill('');
  await page.screenshot({ path: '/tmp/jigeqiu-health-desktop.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Start scan', exact: true }).waitFor();
  assert.equal(await page.locator('[data-health-row]').count(), 0, 'refresh clears all scan results');
  assert.ok(requests.some(request => /\/fallback\//.test(request.url) && request.method === 'GET'));
  assert.ok(requests.every(request => !request.cookie));
  assert.deepEqual(errors, []);
  console.log('PASS link health extension: explanation/cancel, denied permission, real HTTP probes, HEAD fallback, anomalies only, pagination, safe trash, mobile, refresh reset');
} finally {
  await context?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(fixture, { recursive: true, force: true });
  await rm(profile, { recursive: true, force: true });
}
