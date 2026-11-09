import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? 'playwright'
);
const root = fileURLToPath(new URL('../../', import.meta.url));
const extension = path.join(root, 'dist-extension');
const profile = await mkdtemp(
  path.join(os.tmpdir(), 'jigeqiu-extension-browser-'),
);
let context;
async function launch(directory) {
  const browser = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    viewport: { width: 1440, height: 1000 },
    args: [
      `--disable-extensions-except=${directory}`,
      `--load-extension=${directory}`,
    ],
  });
  await browser.route(/^https?:/, async (route) => {
    const url = new URL(route.request().url());
    if (
      ['example.org', 'manual-image.test'].includes(url.hostname) &&
      /\.(ico|png)$/.test(url.pathname)
    ) {
      await route.fulfill({
        contentType: 'image/png',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: await readFile(path.join(extension, 'icons/icon-128.png')),
      });
    } else await route.abort();
  });
  return browser;
}
try {
  context = await launch(extension);
  const page = await context.newPage();
  const errors = [];
  const cspErrors = [];
  const remoteRequests = [];
  context.on('request', (request) => {
    if (/^https?:/.test(request.url()))
      remoteRequests.push({ url: request.url(), type: request.resourceType() });
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (/content security policy|violates.*directive/i.test(message.text()))
      cspErrors.push(message.text());
  });
  page.setDefaultTimeout(15000);
  await page.goto('chrome://newtab/');
  const screenshots = path.join(root, 'test-results/extension');
  await mkdir(screenshots, { recursive: true });
  await page
    .getByRole('heading', { name: '使用前的隐私告知', exact: true })
    .waitFor();
  await page.goto(
    await page.evaluate(() => globalThis.chrome.runtime.getURL('index.html')),
  );
  await page
    .getByRole('heading', { name: '使用前的隐私告知', exact: true })
    .waitFor();
  assert.equal(await page.getByRole('main').count(), 1);
  assert.equal(await page.getByRole('banner').count(), 0);
  await page.screenshot({
    path: path.join(screenshots, 'privacy-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: path.join(screenshots, 'privacy-mobile.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(await page.locator('[data-site-icon]').count(), 0);
  assert.deepEqual(
    remoteRequests,
    [],
    'No workbench network activity before acknowledgment',
  );
  await page.reload();
  await page
    .getByRole('heading', { name: '使用前的隐私告知', exact: true })
    .waitFor();
  await page.getByRole('button', { name: '暂不使用', exact: true }).click();
  assert.equal(await page.getByRole('banner').count(), 0);
  await page.getByRole('button', { name: '返回隐私告知', exact: true }).click();
  await page.getByRole('link', { name: '完整隐私说明', exact: true }).click();
  await page.getByRole('heading', { name: '隐私说明', exact: true }).waitFor();
  await page.screenshot({
    path: path.join(screenshots, 'privacy-policy-desktop.png'),
    fullPage: true,
  });
  assert.deepEqual(
    remoteRequests,
    [],
    'Privacy document uses no external requests',
  );
  await page.getByRole('link', { name: '返回', exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      Storage.prototype.setItem = original;
      if (key === 'jigeqiu-extension-privacy-acknowledged')
        throw new DOMException('Storage full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: '知晓并继续', exact: true }).click();
  await page
    .getByRole('alert')
    .filter({ hasText: '无法保存本地告知记录' })
    .waitFor();
  assert.equal(await page.getByRole('banner').count(), 0);
  assert.equal(await page.locator('[data-site-icon]').count(), 0);
  await page.getByRole('button', { name: '知晓并继续', exact: true }).click();
  await page
    .getByRole('dialog', { name: '欢迎使用记个球', exact: true })
    .waitFor();
  const runtime = await page.evaluate(() => ({
    id: globalThis.chrome?.runtime?.id,
    secure: globalThis.isSecureContext,
    locks: typeof navigator.locks?.request,
  }));
  const manifest = JSON.parse(
    await readFile(path.join(extension, 'manifest.json'), 'utf8'),
  );
  const expectedId = createHash('sha256')
    .update(Buffer.from(manifest.key, 'base64'))
    .digest('hex')
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (digit) =>
      String.fromCharCode(97 + parseInt(digit, 16)),
    );
  assert.equal(runtime.id, expectedId);
  assert.equal(runtime.secure, true);
  assert.equal(runtime.locks, 'function');
  assert.equal(manifest.options_ui, undefined);
  assert.equal(
    await page.getByRole('link', { name: '完整备份与恢复' }).count(),
    0,
  );
  await page.getByRole('button', { name: '暂时跳过', exact: true }).click();
  await page.getByRole('link', { name: '隐私说明', exact: true }).click();
  await page.getByRole('heading', { name: '隐私说明', exact: true }).waitFor();
  await page.getByRole('link', { name: '返回', exact: true }).click();
  await page.getByRole('banner').waitFor();
  await page.keyboard.press('Control+Shift+Enter');
  const dialog = page.getByRole('dialog', { name: '添加收藏', exact: true });
  await dialog
    .getByLabel('网址 URL', { exact: true })
    .fill('https://example.org/extension-test');
  await dialog
    .getByLabel('网站名称', { exact: true })
    .fill('Extension smoke test');
  const picker = dialog.getByRole('group', { name: '网站图标', exact: true });
  await picker.getByRole('button', { name: /网站图标/ }).click();
  const online = picker.getByRole('tabpanel', {
    name: '在线候选',
    exact: true,
  });
  await online.getByRole('button').first().waitFor();
  const candidate = new URL(
    await online.locator('img').first().getAttribute('src'),
  );
  assert.equal(candidate.protocol, 'https:');
  assert.equal(candidate.host, 'example.org');
  await online.getByRole('button').first().click();
  assert.equal(
    await online.getByRole('button').first().getAttribute('aria-pressed'),
    'true',
  );
  await picker.getByRole('tab', { name: '图片链接', exact: true }).click();
  await dialog.getByText(/加载远程图片会连接目标网站/).waitFor();
  await picker
    .getByRole('textbox', { name: '图标图片链接' })
    .fill('https://manual-image.test/icon.png');
  await picker.getByRole('button', { name: '使用图片', exact: true }).click();
  await picker
    .locator('[data-site-icon][data-icon-state="ready"] img')
    .waitFor();
  assert.ok(remoteRequests.length > 0);
  assert.ok(
    remoteRequests.some((request) =>
      request.url.startsWith('https://example.org/'),
    ),
    `Original icon discovery must request website icons: ${JSON.stringify(remoteRequests)}`,
  );
  assert.ok(
    remoteRequests.some(
      (request) =>
        request.url === 'https://manual-image.test/icon.png' &&
        request.type === 'fetch',
    ),
    'Original manual image validation must be retained',
  );
  remoteRequests.length = 0;
  await dialog.getByRole('button', { name: '添加收藏', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const snapshot = await page.evaluate(() =>
    localStorage.getItem('jipage_library_v2'),
  );
  assert.ok(
    JSON.parse(snapshot).bookmarks.some(
      (bookmark) => bookmark.title === 'Extension smoke test',
    ),
  );
  const savedBookmark = JSON.parse(snapshot).bookmarks.find(
    (bookmark) => bookmark.title === 'Extension smoke test',
  );
  assert.equal(savedBookmark.iconMode, 'custom');
  assert.equal(savedBookmark.icon, 'https://manual-image.test/icon.png');
  await page.reload();
  await page.getByRole('banner').waitFor();
  assert.equal(await page.locator('img[src*="/_favicon/"]').count(), 0);
  assert.ok(
    !remoteRequests.some((request) => request.url.includes('/s2/favicons')),
    'Google icon provider remains off by default',
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem('jipage_library_v2')),
    snapshot,
  );
  const second = await context.newPage();
  await second.goto('chrome://newtab/');
  await second.getByRole('banner').waitFor();
  assert.equal(
    await second.evaluate(() => localStorage.getItem('jipage_library_v2')),
    snapshot,
  );
  await second.close();
  const assets = await page.evaluate(async () => {
    const base = globalThis.chrome.runtime.getURL('');
    return Promise.all(
      [
        'brand/logo-a2-equator.png',
        'wallpapers/cyan-lake-desktop.webp',
        'icons/icon-128.png',
      ].map(async (name) => {
        const response = await fetch(base + name);
        return response.ok && (await response.blob()).size > 0;
      }),
    );
  });
  assert.ok(assets.every(Boolean));
  const layout = await page.locator('[data-wallpaper]').evaluate((element) => ({
    position: getComputedStyle(element).position,
    width: element.getBoundingClientRect().width,
  }));
  assert.equal(layout.position, 'relative');
  assert.equal(layout.width, 1440);
  await page.screenshot({
    path: path.join(screenshots, 'desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(screenshots, 'mobile.png'),
    fullPage: true,
  });
  await page.goto(`chrome-extension://${runtime.id}/index.html#/library`);
  await page
    .getByRole('main')
    .getByText('Extension smoke test', { exact: true })
    .waitFor();
  await page.evaluate(() =>
    localStorage.setItem(
      'jigeqiu-extension-privacy-acknowledged',
      'old-version',
    ),
  );
  await page.reload();
  await page
    .getByRole('heading', { name: '使用前的隐私告知', exact: true })
    .waitFor();
  assert.equal(await page.getByRole('banner').count(), 0);
  assert.equal(
    await page.evaluate(() => localStorage.getItem('jipage_library_v2')),
    snapshot,
  );
  await page.getByRole('button', { name: '知晓并继续', exact: true }).click();
  await page.getByRole('banner').waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(cspErrors, []);
  await context.close();
  context = undefined;
  const copy = await mkdtemp(path.join(os.tmpdir(), 'jigeqiu-extension-copy-'));
  try {
    await cp(extension, copy, { recursive: true });
    context = await launch(copy);
    const moved = await context.newPage();
    await moved.goto('chrome://newtab/');
    await moved.getByRole('banner').waitFor();
    assert.equal(
      await moved.evaluate(() => globalThis.chrome.runtime.id),
      runtime.id,
    );
    assert.equal(
      await moved.evaluate(() => localStorage.getItem('jipage_library_v2')),
      snapshot,
    );
    await context.close();
    context = undefined;
  } finally {
    await rm(copy, { recursive: true, force: true });
  }
  console.log(
    'PASS: privacy gate, decline, offline policy, versioned acknowledgment and storage failure; original icons, image notice, fixed identity, persistence, assets, routing and CSP',
  );
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
