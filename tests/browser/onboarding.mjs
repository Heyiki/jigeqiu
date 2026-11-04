import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { transformSync } from 'esbuild';

// Load only the copy catalog; behavioral expectations remain independent of app helpers.
const catalogSource = await readFile(new URL('../../src/i18n/onboarding.ts', import.meta.url), 'utf8');
const catalogJs = transformSync(catalogSource, { loader: 'ts', format: 'esm' }).code;
const { onboardingMessages } = await import(`data:text/javascript;base64,${Buffer.from(catalogJs).toString('base64')}`);
const text = (key, en = false) => onboardingMessages[`onboarding${key}`][en ? 'en' : 'zh'];

// TEST_BUILD never imports Vite or serves source files, APIs, or SPA fallbacks.
const build = process.env.TEST_BUILD === 'true';
// Literal case-name substring for focused debugging; unset runs the entire suite.
const testFilter = process.env.TEST_FILTER?.trim() ?? '';
const screenshots = resolve(process.env.SCREENSHOT_DIR ?? '/tmp/jigeqiu-onboarding');
const root = resolve(process.env.STATIC_DIST ?? 'dist');
const served = [], badResponses = [], sourceRequests = [], errors = [], results = [];
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
let server, browser, origin;

async function startServer() {
  if (!build) {
    const { createServer } = await import('vite');
    server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false } });
    await server.listen();
    return `http://127.0.0.1:${server.httpServer.address().port}`;
  }
  assert.ok((await stat(resolve(root, 'index.html'))).isFile(), 'Build dist before TEST_BUILD=true');
  server = createHttpServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(root + sep) || !['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(403).end(); return;
      }
      if (!(await stat(file)).isFile()) throw Error('Not found');
      const bytes = await readFile(file);
      served.push(pathname);
      response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

const anchor = (page, name) => page.locator(`[data-onboarding="${name}"]`);
const dialog = (page, name) => page.getByRole('dialog', { name, exact: true });
const library = page => page.evaluate(() => JSON.parse(localStorage.getItem('jipage_library_v2')));
const progress = page => page.evaluate(() => JSON.parse(localStorage.getItem('jigeqiu_onboarding_v1')));
const waitProgress = (page, path) => page.waitForFunction(path => {
  const record = JSON.parse(localStorage.getItem('jigeqiu_onboarding_v1'));
  return path.split('.').reduce((value, key) => value?.[key], record) === true;
}, path);

async function device({ width = 1440, en = false, dark = false, reduced = false, fresh = false,
  insecure = false, blockCookies = false, noLocks = false, clock = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: width === 1440 ? 1000 : 844 },
    locale: en ? 'en-US' : 'zh-CN', colorScheme: dark ? 'dark' : 'light',
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (insecure && url.origin === origin.replace('127.0.0.1', 'onboarding.test')) {
      return route.fetch({ url: route.request().url().replace(url.origin, origin) })
        .then(response => route.fulfill({ response }));
    }
    return url.origin === origin ? route.continue() : route.fulfill({ body: '', contentType: 'text/plain' });
  });
  if (blockCookies) await context.addInitScript(() => {
    Object.defineProperty(Document.prototype, 'cookie', { configurable: true, get: () => '', set() {} });
  });
  if (noLocks) await context.addInitScript(() => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  });
  if (!fresh) await context.addInitScript(({ en, dark }) => {
    // A preference record deliberately represents an existing user, not first use.
    if (!localStorage.getItem('jipage_settings_v1')) localStorage.setItem('jipage_settings_v1', JSON.stringify({
      language: en ? 'en-US' : 'zh', showDock: true, appearanceMode: dark ? 'dark-glass' : 'light-glass',
    }));
  }, { en, dark });
  const page = await context.newPage();
  if (clock) await page.clock.install();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push({ url: page.url(), message: error.message }));
  page.on('console', message => {
    // React error boundaries report render failures to console instead of pageerror.
    if (message.type() === 'error' && /(?:ReferenceError|TypeError):/.test(message.text())) {
      errors.push({ url: page.url(), message: message.text() });
    }
  });
  page.on('response', response => {
    if (response.url().startsWith(origin) && response.status() >= 400) badResponses.push(response.url());
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (build && url.origin === origin && /^\/(api|src|@vite|node_modules)(\/|$)/.test(url.pathname)) {
      sourceRequests.push(url.pathname);
    }
  });
  await page.goto(insecure ? origin.replace('127.0.0.1', 'onboarding.test') : origin);
  await anchor(page, 'desktop').waitFor();
  return page;
}

async function run(name, body) {
  if (testFilter && !name.includes(testFilter)) return;
  const before = new Set(browser.contexts());
  try {
    await body();
    results.push({ name, status: 'PASS' });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: 'FAIL', error: error.stack ?? String(error) });
    console.error(`FAIL ${name}: ${error.stack ?? error}`);
    for (const context of browser.contexts().filter(context => !before.has(context))) {
      for (const [index, page] of context.pages().entries()) {
        await page.screenshot({ path: resolve(screenshots, `failure-${name}-${index}.png`), fullPage: true }).catch(() => {});
      }
    }
  } finally {
    for (const context of browser.contexts().filter(context => !before.has(context))) await context.close();
  }
}

async function guideTask(page, task, en = false) {
  await anchor(page, 'guide').click();
  const guide = dialog(page, en ? 'User guide' : '使用指南');
  await guide.getByRole('tab', { name: en ? 'Getting started' : '快速上手', exact: true }).click();
  const names = { tour: 'GuideStart', add: 'GuideAdd', import: 'GuideImport', pin: 'GuidePin' };
  await guide.getByRole('button', { name: text(names[task], en), exact: true }).click();
  await guide.waitFor({ state: 'hidden' });
}

async function contained(locator, width, height, allowTruncation = false) {
  await locator.waitFor();
  const bounds = await locator.boundingBox();
  assert.ok(bounds && bounds.x >= -1 && bounds.y >= -1
    && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1,
  `Panel fits ${width}x${height}: ${JSON.stringify(bounds)}`);
  if (!allowTruncation) assert.equal(await locator.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true,
    `Panel has no horizontal overflow: ${locator}`);
}

async function tour(page, en = false, capture) {
  const popover = page.locator('.driver-popover');
  const titles = ['Desktop', 'Search', 'Launchpad', 'Management', 'Guide'].map(step => text(`Tour${step}Title`, en));
  for (const [index, title] of titles.entries()) {
    await popover.getByText(title, { exact: true }).waitFor();
    assert.equal((await popover.locator('.driver-popover-progress-text').innerText()).trim(), `${index + 1} / 5`);
    await contained(popover, page.viewportSize().width, page.viewportSize().height);
    if (capture) await page.screenshot({ path: resolve(screenshots, `${capture}-step-${index + 1}.png`) });
    await popover.getByRole('button', { name: index === 4 ? (en ? 'Done' : '完成') : (en ? 'Next' : '下一步'), exact: true }).click();
  }
  await popover.waitFor({ state: 'hidden' });
  return dialog(page, text('ChooseTask', en));
}

try {
  await mkdir(screenshots, { recursive: true });
  origin = await startServer();
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
  browser = await chromium.launch({ headless: true });
  // Vite's development client needs trusted-context APIs; insecure-origin cases
  // exercise the production artifact, not that development-only client.
  if (build) {
  await run('http-cookie-welcome-reload-and-replay', async () => {
    const page = await device({ fresh: true, insecure: true });
    assert.equal(await page.evaluate(() => isSecureContext), false, 'Real HTTP origin is insecure');
    assert.equal(await page.evaluate(() => typeof navigator.locks), 'undefined');
    const welcome = dialog(page, text('WelcomeTitle'));
    await welcome.waitFor();
    const notice = anchor(page, 'notice');
    await notice.waitFor();
    assert.match(await notice.innerText(), /HTTP/);
    const cookies = await page.context().cookies();
    const marker = cookies.find(cookie => cookie.name === 'jigeqiu_onboarding_seen_v1');
    assert.ok(marker, 'HTTP remembers only a lightweight welcome marker');
    assert.equal(marker.value, '1');
    assert.equal(marker.path, '/');
    assert.equal(marker.sameSite, 'Lax');
    assert.equal(marker.secure, false);
    const remainingDays = (marker.expires - Date.now() / 1000) / 86400;
    assert.ok(remainingDays > 399 && remainingDays <= 400, 'Marker lasts at most 400 days');
    assert.equal(await progress(page), null, 'Cookie mode never claims to persist full progress');
    assert.equal(await library(page), null, 'Welcome never writes assets');
    await welcome.getByRole('button', { name: text('Skip'), exact: true }).click();
    await page.reload();
    await anchor(page, 'guide').waitFor();
    assert.equal(await welcome.count(), 0, 'Cookie suppresses welcome on reload');
    assert.equal(await notice.count(), 0, 'Reload with a marker does not repeat the notice');
    await guideTask(page, 'tour');
    const picker = await tour(page);
    await picker.getByRole('button', { name: text('Later'), exact: true }).click();
    assert.equal(await progress(page), null, 'Manual replay never writes unlocked full progress');
    assert.equal(await library(page), null);
  });
  await run('http-cookie-blocked-notice-expires-once', async () => {
    const page = await device({ fresh: true, insecure: true, blockCookies: true, clock: true });
    const welcome = dialog(page, text('WelcomeTitle'));
    await welcome.waitFor();
    const notice = anchor(page, 'notice');
    await notice.waitFor();
    assert.match(await notice.innerText(), /暂时无法记住引导状态/);
    await welcome.getByRole('button', { name: text('Skip'), exact: true }).click();
    await notice.hover();
    await page.clock.runFor(7000);
    assert.equal(await notice.isVisible(), true, 'Hover pauses dismissal');
    const close = notice.getByRole('button');
    await close.focus();
    await page.mouse.move(0, 0);
    await page.clock.runFor(7000);
    assert.equal(await notice.isVisible(), true, 'Keyboard focus pauses dismissal');
    await anchor(page, 'guide').focus();
    await page.clock.runFor(5999);
    assert.equal(await notice.isVisible(), true);
    await page.clock.runFor(2);
    await notice.waitFor({ state: 'hidden' });
    await guideTask(page, 'tour');
    const picker = await tour(page);
    await picker.getByRole('button', { name: text('Later'), exact: true }).click();
    assert.equal(await notice.count(), 0, 'Later steps do not repeat the same failed notice');
    assert.equal(await progress(page), null);
    assert.equal(await library(page), null);
  });
  await run('http-cookie-notice-manual-dismiss', async () => {
    const page = await device({ fresh: true, insecure: true });
    await dialog(page, text('WelcomeTitle')).getByRole('button', { name: text('Skip'), exact: true }).click();
    const notice = anchor(page, 'notice');
    await notice.getByRole('button').click();
    await notice.waitFor({ state: 'hidden' });
    await guideTask(page, 'tour');
    await page.locator('.driver-popover-close-btn').click();
    assert.equal(await notice.count(), 0, 'Dismissed informational notice stays dismissed');
  });
  for (const width of [1440, 320]) for (const dark of [false, true]) for (const en of [false, true]) {
    await run(`http-cookie-layout-and-asset-lock-${width}-${dark}-${en}`, async () => {
      const page = await device({ width, dark, en, insecure: true });
      await guideTask(page, 'add', en);
      const notice = anchor(page, 'notice');
      await contained(notice, width, page.viewportSize().height);
      if (en) assert.doesNotMatch(await notice.innerText(), /[\u3400-\u9fff]/);
      const close = notice.getByRole('button');
      await close.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await close.evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
      await page.screenshot({ path: resolve(screenshots, `http-cookie-${width}-${dark}-${en}.png`) });
      await close.click();
      await anchor(page, 'add-url').fill('https://http.example.invalid/draft');
      await anchor(page, 'add-title').fill('HTTP synthetic draft');
      await anchor(page, 'add-save').click();
      const form = page.getByRole('dialog').filter({ has: anchor(page, 'add-url') });
      await form.getByRole('alert').waitFor();
      assert.equal(await library(page), null, 'Cookie fallback never bypasses the asset write lock');
      assert.equal(await anchor(page, 'add-title').inputValue(), 'HTTP synthetic draft');
      assert.equal(await notice.count(), 0, 'Asset failure does not resurrect the onboarding notice');
    });
  }
  }
  await run('secure-missing-locks-never-falls-back-to-cookie', async () => {
    const page = await device({ fresh: true, noLocks: true, clock: true });
    assert.equal(await page.evaluate(() => isSecureContext), true);
    const notice = page.getByRole('status').filter({ hasText: text('ProgressSaveFailed') });
    await notice.waitFor();
    assert.deepEqual(await page.context().cookies(), []);
    assert.equal(await progress(page), null);
    await page.clock.runFor(6001);
    await notice.waitFor({ state: 'hidden' });
    await guideTask(page, 'tour');
    const picker = await tour(page);
    await picker.getByRole('button', { name: text('Later'), exact: true }).click();
    assert.equal(await notice.count(), 0, 'Repeated save failure stays quiet in this page session');
  });
  for (const width of [1440, 320]) for (const dark of [false, true]) for (const en of [false, true]) {
    await run(`task-hint-warning-${width}-${dark ? 'dark' : 'light'}-${en ? 'en' : 'zh'}`, async () => {
      const page = await device({ width, dark, en });
      await guideTask(page, 'add', en);
      const hint = anchor(page, 'task-hint');
      await contained(hint, width, page.viewportSize().height);
      const colors = await hint.evaluate(element => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        const rgb = value => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = value;
          ctx.fillRect(0, 0, 1, 1);
          return Array.from(ctx.getImageData(0, 0, 1, 1).data);
        };
        const style = getComputedStyle(element);
        return { background: rgb(style.backgroundColor), text: rgb(style.color), border: rgb(style.borderTopColor) };
      });
      assert.ok(colors.background[0] > colors.background[1] && colors.background[1] > colors.background[2],
        `Instruction has a warm warning surface: ${JSON.stringify(colors)}`);
      assert.ok(colors.border[0] > colors.border[2] * 2, 'Warning border is amber, not blue');
      const luminance = rgb => rgb.slice(0, 3).map(value => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
      const values = [luminance(colors.background), luminance(colors.text)].sort((a, b) => a - b);
      assert.ok((values[1] + 0.05) / (values[0] + 0.05) >= 4.5, 'Hint text contrast is at least 4.5:1');
      assert.equal(await hint.locator('svg.lucide-info').count(), 1, 'Instruction has a recognizable information icon');
      const exit = hint.getByRole('button', { name: text('Exit', en), exact: true });
      await exit.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await exit.evaluate(element => element === document.activeElement), true);
      assert.equal(await exit.evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
      await page.screenshot({ path: resolve(screenshots, `hint-warning-${width}-${dark ? 'dark' : 'light'}-${en ? 'en' : 'zh'}.png`) });
      await exit.click();
      await hint.waitFor({ state: 'hidden' });
      await anchor(page, 'add-url').waitFor();
    });
  }
  await run('fresh-welcome-skip-once', async () => {
    const page = await device({ fresh: true });
    const welcome = dialog(page, text('WelcomeTitle'));
    await welcome.waitFor();
    assert.equal(await library(page), null, 'Welcome never seeds sample assets');
    await welcome.getByRole('button', { name: text('Skip'), exact: true }).click();
    await welcome.waitFor({ state: 'hidden' });
    await waitProgress(page, 'welcomeSkipped');
    assert.equal((await progress(page)).welcomeSkipped, true);
    await page.reload();
    await anchor(page, 'guide').waitFor();
    assert.equal(await welcome.count(), 0, 'Skipped welcome never returns after reload');
    assert.equal(await library(page), null, 'Skipping must not create assets');
  });
  await run('fresh-start-replay-and-close', async () => {
    const page = await device({ fresh: true });
    await dialog(page, text('WelcomeTitle')).getByRole('button', { name: text('Start'), exact: true }).click();
    const picker = await tour(page);
    await picker.waitFor();
    await waitProgress(page, 'tourCompleted');
    assert.equal((await progress(page)).tourCompleted, true);
    assert.equal(await library(page), null, 'Tour and task picker never seed assets');
    await picker.getByRole('button', { name: text('Later'), exact: true }).click();
    await guideTask(page, 'tour');
    await page.locator('.driver-popover-close-btn').click();
    await page.locator('.driver-popover').waitFor({ state: 'hidden' });
    assert.equal(await picker.count(), 0, 'Closing a replay does not complete into task picker');
    assert.equal(await anchor(page, 'guide').evaluate(element => document.activeElement === element), true,
      'Tour close restores guide focus');
    await page.reload();
    await anchor(page, 'guide').waitFor();
    assert.equal(await dialog(page, text('WelcomeTitle')).count(), 0);
  });
  await run('existing-profile-no-welcome-and-empty-pin', async () => {
    const page = await device();
    assert.equal(await dialog(page, text('WelcomeTitle')).count(), 0, 'Existing preferences suppress first-use welcome');
    await guideTask(page, 'pin');
    const picker = dialog(page, text('ChooseTask'));
    await picker.waitFor();
    assert.equal(await picker.getByRole('button', { name: text('PinTask'), exact: true }).count(), 0,
      'Empty library offers add/import instead of an impossible pin task');
    await picker.getByRole('button', { name: text('Later'), exact: true }).click();
    assert.equal(await library(page), null);
  });
  await run('guided-add-normal-default-and-launchpad-pin', async () => {
    const page = await device();
    await page.keyboard.press('Control+Shift+Enter');
    const add = page.getByRole('dialog').filter({ has: anchor(page, 'add-url') });
    await add.waitFor();
    assert.equal(await add.getByRole('checkbox').isChecked(), true, 'Normal desktop add defaults to pinning');
    await add.getByRole('button', { name: '取消', exact: true }).click();
    await guideTask(page, 'add');
    await add.waitFor();
    assert.equal(await add.getByRole('checkbox').isChecked(), false, 'Guided add leaves pinning explicit');
    await anchor(page, 'task-hint').getByText('填入你想收藏的网址。', { exact: true }).waitFor();
    await anchor(page, 'add-url').fill('https://onboarding.example.invalid/saved');
    await anchor(page, 'add-title').fill('Onboarding synthetic bookmark');
    await anchor(page, 'task-hint').getByText('确认名称和保存位置；关键词可选，用熟悉的叫法帮助以后找回。', { exact: true }).waitFor();
    await anchor(page, 'add-save').click();
    const result = anchor(page, 'result');
    await result.getByText(text('AddDone'), { exact: true }).waitFor();
    const saved = await library(page);
    assert.equal(saved.bookmarks.length, 1);
    assert.equal(saved.bookmarks[0].pinnedToDesktop, false);
    assert.equal(saved.desktopLayout?.shortcuts.length ?? 0, 0);
    await waitProgress(page, 'tasks.add');
    assert.equal((await progress(page)).tasks.add, true);
    await result.getByRole('button', { name: text('BackupTitle'), exact: true }).waitFor();
    await result.getByRole('button', { name: text('PinTask'), exact: true }).click();
    await anchor(page, 'pin-search').fill('Onboarding synthetic');
    await anchor(page, 'pin-more').click();
    await page.getByRole('menuitem', { name: '固定到桌面', exact: true }).click();
    await result.getByText(text('PinDone'), { exact: true }).waitFor();
    const pinned = await library(page);
    assert.equal(pinned.bookmarks.length, 1, 'Pin creates a reference, never a duplicate asset');
    assert.ok(pinned.desktopLayout.shortcuts.some(shortcut => shortcut.bookmarkId === saved.bookmarks[0].id));
    await waitProgress(page, 'tasks.pin');
    assert.equal((await progress(page)).tasks.pin, true);
    await result.getByRole('button', { name: '完成', exact: true }).click();
    await page.locator('.desktop-item').filter({ hasText: 'Onboarding synthetic bookmark' }).waitFor();
    await page.reload();
    await page.locator('.desktop-item').filter({ hasText: 'Onboarding synthetic bookmark' }).waitFor();
  });
  await run('guided-html-import-preview-backup', async () => {
    const page = await device();
    await guideTask(page, 'import');
    await anchor(page, 'task-hint').getByText(text('ImportFile'), { exact: true }).waitFor();
    await anchor(page, 'import-file').setInputFiles({
      name: 'synthetic-onboarding.html', mimeType: 'text/html',
      buffer: Buffer.from('<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><H3>Synthetic onboarding</H3><DL><DT><A HREF="https://import.example.invalid/alpha">Synthetic Alpha</A></DL></DL>'),
    });
    await anchor(page, 'task-hint').getByText(text('ImportPreview'), { exact: true }).waitFor();
    assert.equal(await library(page), null, 'Import preview cannot write assets');
    await anchor(page, 'import-confirm').click();
    const result = anchor(page, 'result');
    await result.getByText(text('ImportDone'), { exact: true }).waitFor();
    const imported = await library(page);
    assert.equal(imported.bookmarks.length, 1);
    assert.equal(imported.folders.length, 1);
    assert.equal(imported.bookmarks[0].title, 'Synthetic Alpha');
    assert.equal(imported.bookmarks[0].pinnedToDesktop, false);
    assert.equal(imported.desktopLayout?.shortcuts.length ?? 0, 0);
    await waitProgress(page, 'tasks.import');
    await waitProgress(page, 'backupReminderShown');
    assert.equal((await progress(page)).tasks.import, true);
    assert.equal((await progress(page)).backupReminderShown, true);
    await result.getByRole('button', { name: text('BackupTitle'), exact: true }).click();
    await anchor(page, 'json-export').waitFor();
    try {
      await page.waitForFunction(() => document.activeElement?.matches('[data-onboarding="json-export"]'), null, { timeout: 2000 });
    } catch (cause) {
      const focus = await page.evaluate(() => ({
        active: document.activeElement?.outerHTML.slice(0, 500),
        exportConnected: document.querySelector('[data-onboarding="json-export"]')?.isConnected,
        hash: location.hash,
      }));
      throw new Error(`Backup export focus was lost: ${JSON.stringify(focus)}`, { cause });
    }
  });
  await run('duplicate-edit-handoff-cancel', async () => {
    const page = await device();
    await page.keyboard.press('Control+Shift+Enter');
    const add = page.getByRole('dialog').filter({ has: anchor(page, 'add-url') });
    await anchor(page, 'add-url').fill('https://duplicate.example.invalid/saved');
    await anchor(page, 'add-title').fill('Synthetic existing bookmark');
    await add.getByRole('checkbox').uncheck();
    await anchor(page, 'add-save').click();
    await add.waitFor({ state: 'hidden' });
    const before = await library(page);
    await guideTask(page, 'add');
    await anchor(page, 'add-url').fill('https://duplicate.example.invalid/saved');
    await add.getByRole('button', { name: '编辑已有收藏', exact: true }).click();
    const edit = dialog(page, '编辑收藏');
    await edit.waitFor();
    assert.equal(await anchor(page, 'task-hint').count(), 0, 'Duplicate handoff exits the add teaching flow');
    await anchor(page, 'add-title').fill('Unsaved synthetic edit');
    await edit.getByRole('button', { name: '取消', exact: true }).click();
    await edit.waitFor({ state: 'hidden' });
    assert.deepEqual(await library(page), before, 'Cancelling handed-off edit preserves the existing asset');
    assert.equal((await progress(page))?.tasks.add ?? false, false, 'Editing a duplicate never completes an add task');
    assert.equal(await anchor(page, 'result').count(), 0, 'Cancellation never leaves a phantom success panel');
    await guideTask(page, 'tour');
    await page.locator('.driver-popover').waitFor();
    await page.locator('.driver-popover-close-btn').click();
    await page.locator('.driver-popover').waitFor({ state: 'hidden' });
  });
  await run('guided-add-quota-and-dismiss-retains-draft', async () => {
    const page = await device();
    await guideTask(page, 'add');
    const add = page.getByRole('dialog').filter({ has: anchor(page, 'add-url') });
    await anchor(page, 'add-url').fill('https://quota.example.invalid/draft');
    await anchor(page, 'add-title').fill('Synthetic unsaved draft');
    const before = await library(page);
    await page.evaluate(() => {
      window.onboardingOriginalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'jipage_library_v2') throw new DOMException('Synthetic library quota', 'QuotaExceededError');
        return window.onboardingOriginalSetItem.call(this, key, value);
      };
    });
    try {
      await anchor(page, 'add-save').click();
      await add.getByRole('alert').waitFor();
      assert.deepEqual(await library(page), before, 'Quota failure never partially creates an asset or desktop shortcut');
      assert.equal((await progress(page))?.tasks.add ?? false, false, 'Failed guided add never completes the task');
      assert.equal((await progress(page))?.backupReminderShown ?? false, false, 'Failed add never consumes the backup reminder');
      assert.equal(await anchor(page, 'result').count(), 0);
      assert.equal(await anchor(page, 'add-url').inputValue(), 'https://quota.example.invalid/draft');
      assert.equal(await anchor(page, 'add-title').inputValue(), 'Synthetic unsaved draft');
      assert.equal(await add.getByRole('checkbox').isChecked(), false);
      await anchor(page, 'task-hint').getByRole('button', { name: text('Exit'), exact: true }).click();
      await anchor(page, 'task-hint').waitFor({ state: 'hidden' });
      assert.equal(await add.isVisible(), true, 'Dismissing instruction keeps the real form open');
      assert.equal(await anchor(page, 'add-url').inputValue(), 'https://quota.example.invalid/draft');
      assert.equal(await anchor(page, 'add-title').inputValue(), 'Synthetic unsaved draft');
      assert.equal(await add.getByRole('checkbox').isChecked(), false, 'Dismissing guidance never resets the pin preference');
      assert.deepEqual(await library(page), before);
    } finally {
      await page.evaluate(() => {
        Storage.prototype.setItem = window.onboardingOriginalSetItem;
        delete window.onboardingOriginalSetItem;
      });
    }
    await anchor(page, 'add-save').click();
    await add.waitFor({ state: 'hidden' });
    const saved = await library(page);
    assert.equal(saved.bookmarks.length, 1, 'The preserved draft can be saved after quota recovery');
    assert.equal(saved.bookmarks[0].title, 'Synthetic unsaved draft');
    assert.equal(saved.bookmarks[0].pinnedToDesktop, false);
    assert.equal(saved.desktopLayout?.shortcuts.length ?? 0, 0);
    assert.equal((await progress(page))?.tasks.add ?? false, false, 'Saving after exiting guidance never completes the cancelled task');
    assert.equal(await anchor(page, 'result').count(), 0);
  });
  await run('invalid-import-never-completes', async () => {
    const page = await device();
    await guideTask(page, 'import');
    const before = await library(page);
    await anchor(page, 'import-file').setInputFiles({
      name: 'synthetic-invalid.html', mimeType: 'text/html',
      buffer: Buffer.from('<!doctype html><html><body><p>Not a bookmark export</p></body></html>'),
    });
    const importer = anchor(page, 'html-import');
    const alert = importer.getByRole('alert');
    await alert.waitFor();
    assert.ok((await alert.innerText()).trim(), 'Invalid import explains the refusal');
    assert.equal(await anchor(page, 'import-confirm').isDisabled(), true);
    assert.deepEqual(await library(page), before, 'Rejected import cannot write the library');
    assert.equal((await progress(page))?.tasks.import ?? false, false, 'Invalid input never completes import guidance');
    assert.equal((await progress(page))?.backupReminderShown ?? false, false);
    assert.equal(await anchor(page, 'result').count(), 0);
    await anchor(page, 'task-hint').getByText(text('ImportFile'), { exact: true }).waitFor();
    await importer.getByRole('button', { name: '取消', exact: true }).click();
    await anchor(page, 'task-hint').waitFor({ state: 'hidden' });
    assert.equal(await alert.count(), 0);
    assert.deepEqual(await library(page), before, 'Cancelling invalid import is also read-only');
    assert.equal((await progress(page))?.tasks.import ?? false, false);
  });
  for (const inFolder of [false, true]) await run(`already-pinned-view-${inFolder ? 'folder' : 'root'}`, async () => {
    const page = await device();
    await page.keyboard.press('Control+Shift+Enter');
    const add = page.getByRole('dialog').filter({ has: anchor(page, 'add-url') });
    await anchor(page, 'add-url').fill('https://pinned.example.invalid/existing');
    await anchor(page, 'add-title').fill('Synthetic already pinned');
    assert.equal(await add.getByRole('checkbox').isChecked(), true);
    await anchor(page, 'add-save').click();
    await add.waitFor({ state: 'hidden' });
    const bookmark = (await library(page)).bookmarks[0];
    let folderId;
    if (inFolder) {
      await page.getByTitle('新建桌面文件夹', { exact: true }).click();
      const create = dialog(page, '新建桌面文件夹');
      await create.getByRole('textbox', { name: '文件夹名称', exact: true }).fill('Synthetic pinned group');
      await create.getByRole('button', { name: '创建文件夹', exact: true }).click();
      await create.waitFor({ state: 'hidden' });
      folderId = (await library(page)).desktopLayout.folders.find(folder => folder.name === 'Synthetic pinned group').id;
      await page.locator(`[data-active="true"] [data-desktop-id="${bookmark.id}"]`).click({ button: 'right' });
      await page.getByRole('menu', { name: '桌面菜单', exact: true })
        .getByRole('menuitem', { name: '移至桌面文件夹…', exact: true }).click();
      const move = dialog(page, '移动桌面快捷方式');
      await move.getByLabel('目标桌面文件夹', { exact: true }).selectOption(folderId);
      await move.getByRole('button', { name: '移动', exact: true }).click();
      await move.waitFor({ state: 'hidden' });
    }
    const before = await library(page);
    await guideTask(page, 'pin');
    await anchor(page, 'pin-search').fill('Synthetic already pinned');
    await anchor(page, 'pin-more').click();
    const view = page.getByRole('menuitem', { name: text('ViewShortcut'), exact: true });
    await view.waitFor();
    assert.equal(await page.getByRole('menuitem', { name: '从桌面移除', exact: true }).count(), 0,
      'Guidance never offers unpin for an already pinned bookmark');
    assert.equal(await page.getByRole('menuitem', { name: '固定到桌面', exact: true }).count(), 0,
      'Guidance never creates a duplicate shortcut');
    await view.click();
    await dialog(page, '启动台').waitFor({ state: 'hidden' });
    if (inFolder) {
      const group = dialog(page, '桌面文件夹');
      await group.waitFor();
      await group.locator(`[data-folder-bookmark="${bookmark.id}"]`).waitFor();
      await group.getByText(text('PinDone'), { exact: true }).waitFor();
      assert.equal(await anchor(page, 'result').count(), 0, 'Folder receives the inline result, with no competing floating panel');
      const current = await library(page);
      assert.deepEqual(current.desktopLayout.folders.find(folder => folder.id === folderId),
        before.desktopLayout.folders.find(folder => folder.id === folderId), 'Reveal preserves desktop folder membership');
    } else {
      await page.locator(`[data-active="true"] [data-desktop-id="${bookmark.id}"]`).waitFor();
      await anchor(page, 'result').getByText(text('PinDone'), { exact: true }).waitFor();
    }
    assert.deepEqual(await library(page), before, 'Viewing an existing shortcut never mutates assets, layout or pin state');
    await waitProgress(page, 'tasks.pin');
    assert.equal((await progress(page)).tasks.pin, true, 'Revealing the existing shortcut completes the pin experience');
  });
  await run('hide-taskbar-resumes-tips-and-tour-fallback', async () => {
    const page = await device({ reduced: true });
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 100));
    await page.reload();
    const dock = page.getByTestId('bottom-dock');
    // Right-click the shell padding, away from bookmark and launchpad handlers.
    const shell = dock.locator(':scope > div');
    const bounds = await shell.boundingBox();
    await shell.click({ button: 'right', position: { x: 5, y: bounds.height / 2 } });
    await page.getByRole('button', { name: '隐藏任务栏', exact: true }).click();
    await dock.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_settings_v1')).showDock), false);
    await page.mouse.move(0, 0);
    await anchor(page, 'guide').focus();
    const tip = anchor(page, 'search').locator('[data-tip-id]');
    const before = await tip.getAttribute('data-tip-id');
    await page.clock.runFor(8300);
    assert.notEqual(await tip.getAttribute('data-tip-id'), before, 'Unmounting an active taskbar menu releases the tips pause');
    await guideTask(page, 'tour');
    const popover = page.locator('.driver-popover');
    await popover.getByText(text('TourDesktopTitle'), { exact: true }).waitFor();
    await popover.getByRole('button', { name: text('Next'), exact: true }).click();
    await popover.getByRole('button', { name: text('Next'), exact: true }).click();
    await popover.getByText(text('TourLaunchpadTitle'), { exact: true }).waitFor();
    await popover.getByText(text('TourLaunchpadFallback'), { exact: false }).waitFor();
    await popover.locator('.driver-popover-close-btn').click();
    await popover.waitFor({ state: 'hidden' });
    // Driver settles exit in a microtask; let the installed clock deliver it
    // before measuring a fresh application timer hold.
    await page.clock.runFor(100);
    await anchor(page, 'guide').waitFor();
    const resumed = await tip.getAttribute('data-tip-id');
    await page.mouse.move(0, 0);
    await anchor(page, 'guide').focus();
    const pausedBeforeHold = await anchor(page, 'search').getAttribute('data-tips-paused');
    await page.clock.runFor(8300);
    const after = await tip.getAttribute('data-tip-id');
    const state = await page.evaluate(() => {
      const search = document.querySelector('[data-onboarding="search"]');
      const tip = search?.querySelector('[data-tip-id]');
      const main = document.querySelector('main[data-onboarding-phase]');
      return {
        onboardingPhase: main?.getAttribute('data-onboarding-phase') ?? null,
        desktopInteraction: document.querySelector('[data-desktop-interaction]')?.getAttribute('data-desktop-interaction') ?? null,
        dockInteraction: document.querySelector('[data-dock-interaction]')?.getAttribute('data-dock-interaction') ?? null,
        active: document.activeElement?.outerHTML.slice(0, 350),
        dialogs: [...document.querySelectorAll('[role="dialog"]')].map(element => element.getAttribute('aria-label')),
        driver: document.querySelectorAll('.driver-overlay, .driver-popover').length,
        tipsPaused: search?.getAttribute('data-tips-paused'),
        tipsDetails: Object.fromEntries([...(search?.attributes ?? [])]
          .filter(attribute => attribute.name.startsWith('data-tips-'))
          .map(attribute => [attribute.name, attribute.value])),
        tipId: tip?.getAttribute('data-tip-id'),
        tipPhase: tip?.getAttribute('data-tip-phase'),
        hovered: search?.matches(':hover'),
        focused: search === document.activeElement,
        documentHidden: document.hidden,
      };
    });
    state.pausedBeforeHold = pausedBeforeHold;
    assert.notEqual(after, resumed, `Closing a fallback tour resumes tips without the taskbar: ${JSON.stringify(state)}`);
  });
  await run('route-leave-cleans-up-active-tour', async () => {
    const page = await device();
    await guideTask(page, 'tour');
    await page.locator('.driver-popover').waitFor();
    // A hash navigation models browser history or an externally supplied deep link.
    await page.evaluate(() => { location.hash = '#/start'; });
    await dialog(page, '启动台').waitFor();
    await page.locator('.driver-popover').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.driver-overlay').count(), 0, 'Route leave removes the driver interaction overlay');
    assert.equal((await progress(page))?.tourCompleted ?? false, false, 'Leaving does not complete the tour');
    await page.keyboard.press('Escape');
    await anchor(page, 'guide').waitFor();
    await anchor(page, 'search').click();
    await page.locator('[data-panel="search"]').getByRole('combobox').fill('route leave remains interactive');
    await page.keyboard.press('Escape');
    await guideTask(page, 'tour');
    await page.locator('.driver-popover').getByText(text('TourDesktopTitle'), { exact: true }).waitFor();
    await page.locator('.driver-popover-close-btn').click();
    await page.locator('.driver-popover').waitFor({ state: 'hidden' });
  });
  for (const reduced of [false, true]) await run(`tips-clock-${reduced ? 'reduced' : 'animated'}`, async () => {
    const page = await device({ reduced });
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 100));
    // Reload under the installed clock so the application owns no real-time timers.
    await page.reload();
    const search = anchor(page, 'search');
    const tip = search.locator('[data-tip-id]');
    await tip.waitFor();
    await page.mouse.move(0, 0);
    await anchor(page, 'guide').focus();
    const first = await tip.getAttribute('data-tip-id');
    await page.clock.runFor(7999);
    assert.equal(await tip.getAttribute('data-tip-id'), first, 'Tip stays visible for at least eight seconds');
    await page.clock.runFor(301);
    assert.notEqual(await tip.getAttribute('data-tip-id'), first, 'Tip rotates after hold and optional fade');
    if (reduced) assert.equal(await tip.evaluate(element => getComputedStyle(element).transitionDuration), '0s');
    const second = await tip.getAttribute('data-tip-id');
    await search.hover();
    await page.clock.runFor(24000);
    assert.equal(await tip.getAttribute('data-tip-id'), second, 'Hover pauses rotation');
    await search.focus();
    await page.mouse.move(0, 0);
    await page.clock.runFor(24000);
    assert.equal(await tip.getAttribute('data-tip-id'), second, 'Keyboard focus pauses rotation');
    await anchor(page, 'guide').focus();
    await page.clock.runFor(8300);
    assert.notEqual(await tip.getAttribute('data-tip-id'), second, 'Leaving hover/focus resumes rotation');
    await search.click();
    const input = page.locator('[data-panel="search"]').getByRole('combobox');
    await input.fill('synthetic retained input');
    const placeholder = await input.getAttribute('placeholder');
    const paused = await tip.getAttribute('data-tip-id');
    await page.clock.runFor(24000);
    assert.equal(await input.inputValue(), 'synthetic retained input');
    assert.equal(await input.getAttribute('placeholder'), placeholder, 'Input placeholder never rotates');
    assert.equal(await input.evaluate(element => document.activeElement === element), true);
    assert.equal(await tip.getAttribute('data-tip-id'), paused, 'Search overlay pauses rotation');
  });
  for (const width of [1440, 390, 320]) {
    for (const en of [false, true]) {
      for (const dark of [false, true]) await run(`layout-${width}-${en ? 'en' : 'zh'}-${dark ? 'dark' : 'light'}`, async () => {
        const page = await device({ width, en, dark, reduced: width === 320 });
        const height = page.viewportSize().height;
        const prefix = `onboarding-${width}-${en ? 'en' : 'zh'}-${dark ? 'dark' : 'light'}`;
        await contained(anchor(page, 'search'), width, height, true);
        await contained(anchor(page, 'guide'), width, height);
        const label = await anchor(page, 'search').getAttribute('aria-label');
        assert.ok(label);
        await guideTask(page, 'tour', en);
        const picker = await tour(page, en, prefix);
        await contained(picker, width, height);
        if (en) assert.doesNotMatch(await picker.innerText(), /[\u3400-\u9fff]/, 'English onboarding has no Chinese copy');
        await page.screenshot({ path: resolve(screenshots, `${prefix}-picker.png`) });
        await picker.getByRole('button', { name: text('Later', en), exact: true }).click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await guideTask(page, 'add', en);
        const add = page.getByRole('dialog').filter({ has: anchor(page, 'add-url') });
        await contained(add, width, height);
        await page.screenshot({ path: resolve(screenshots, `${prefix}-add.png`) });
        await add.getByRole('button', { name: en ? 'Cancel' : '取消', exact: true }).click();
        assert.equal(await anchor(page, 'search').getAttribute('aria-label'), label, 'Search accessible name stays stable');
      });
    }
  }
  assert.ok(results.length > 0, `TEST_FILTER matched no cases: ${JSON.stringify(testFilter)}`);
  assert.deepEqual(errors, [], 'No uncaught page errors');
  assert.deepEqual(badResponses, [], 'No failed local resources');
  if (build) {
    assert.deepEqual(sourceRequests, [], 'Dist-only mode cannot request source or APIs');
    assert.ok(served.some(path => path.startsWith('/assets/') && path.endsWith('.js')));
    assert.ok(served.some(path => path.startsWith('/assets/') && path.endsWith('.css')));
  }
  assert.equal(results.filter(result => result.status === 'FAIL').length, 0, 'Onboarding regressions failed');
} finally {
  await writeFile(resolve(screenshots, 'results.json'), JSON.stringify({
    build, testFilter: testFilter || null, results, errors, badResponses, sourceRequests,
  }, null, 2));
  await browser?.close();
  if (build && server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  } else await server?.close();
}
