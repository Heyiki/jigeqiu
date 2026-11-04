import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('https://**/*', route => route.fulfill({ body: '' }));
  const first = await context.newPage();
  const second = await context.newPage();
  const errors = [];
  for (const page of [first, second]) {
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => errors.push(error.message));
  }
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  await first.goto(url);
  await second.goto(url);
  const fill = async (page, title, address) => {
    await page.getByRole('banner').waitFor();
    await page.keyboard.press('Control+Shift+Enter');
    const dialog = page.getByRole('dialog').filter({ has: page.getByLabel('网址 URL', { exact: true }) });
    await dialog.getByLabel('网址 URL', { exact: true }).fill(address);
    await dialog.getByLabel('网站名称', { exact: true }).fill(title);
    await dialog.getByRole('checkbox').uncheck();
    return dialog;
  };
  const saved = () => first.evaluate(() => localStorage.getItem('jipage_library_v2'));
  const draft = await fill(second, 'Keep this unsaved draft', 'https://draft.example/');
  const active = await fill(first, 'Saved in first page', 'https://first.example/');
  await active.getByRole('button', { name: '添加收藏', exact: true }).click();
  await active.waitFor({ state: 'hidden' });
  const before = await saved();
  await second.getByRole('status', { name: '收藏库更新提示', exact: true }).waitFor();
  await draft.getByRole('button', { name: '添加收藏', exact: true }).click();
  await draft.getByRole('alert').waitFor();
  assert.equal(await draft.getByLabel('网站名称', { exact: true }).inputValue(), 'Keep this unsaved draft');
  assert.equal(await saved(), before);
  const downloaded = second.waitForEvent('download');
  await draft.getByRole('button', { name: '下载当前草稿', exact: true }).click();
  const download = await downloaded;
  const contents = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(contents.format, 'jigeqiu-bookmark-draft');
  assert.equal(contents.draft.title, 'Keep this unsaved draft');
  assert.equal(contents.draft.url, 'https://draft.example/');
  assert.ok(!JSON.stringify(contents).includes('Saved in first page'));
  assert.equal(await saved(), before);
  await draft.getByRole('button', { name: '取消', exact: true }).click();
  const notice = second.getByRole('status', { name: '收藏库更新提示', exact: true });
  await mkdir('/tmp/jigeqiu-library-tabs', { recursive: true });
  for (const width of [1440, 390, 320]) {
    await second.setViewportSize({ width, height: 900 });
    await second.screenshot({ path: `/tmp/jigeqiu-library-tabs/notice-${width}.png` });
    assert.equal(await second.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  await notice.getByRole('button', { name: '重新载入', exact: true }).click();
  const confirmation = second.getByRole('dialog', { name: '重新载入最新收藏库？', exact: true });
  await confirmation.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await saved(), before);
  await notice.getByRole('button', { name: '重新载入', exact: true }).click();
  await Promise.all([
    second.waitForNavigation({ waitUntil: 'load' }),
    confirmation.getByRole('button', { name: '确认重新载入', exact: true }).click(),
  ]);
  await notice.waitFor({ state: 'hidden' });
  const retry = await fill(second, 'Recovered draft', 'https://draft.example/');
  await retry.getByRole('button', { name: '添加收藏', exact: true }).click();
  await retry.waitFor({ state: 'hidden' });
  assert.equal(JSON.parse(await saved()).bookmarks.length, 2);
  await first.getByRole('status', { name: '收藏库更新提示', exact: true }).waitFor();

  // Both dialogs start from the same revision; only one shared-lock commit may win.
  await first.reload();
  await second.reload();
  const one = await fill(first, 'Race one', 'https://race-one.example/');
  const two = await fill(second, 'Race two', 'https://race-two.example/');
  await Promise.all([
    one.getByRole('button', { name: '添加收藏', exact: true }).click(),
    two.getByRole('button', { name: '添加收藏', exact: true }).click(),
  ]);
  await Promise.race([one.getByRole('alert').waitFor(), two.getByRole('alert').waitFor()]);
  assert.equal(JSON.parse(await saved()).bookmarks.length, 3);
  assert.equal((await one.isVisible() ? 1 : 0) + (await two.isVisible() ? 1 : 0), 1);
  await first.reload();
  await second.reload();
  const edit = async (page, title) => {
    await page.getByRole('banner').getByRole('button', { name: '管理中心', exact: true }).click();
    const row = page.locator('[data-library-bookmark]').filter({ hasText: 'Saved in first page' });
    await row.hover();
    await row.getByTitle('编辑收藏', { exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '编辑收藏', exact: true });
    await dialog.getByLabel('网站名称', { exact: true }).fill(title);
    return dialog;
  };
  const oldEdit = await edit(second, 'Unsaved old edit');
  const newEdit = await edit(first, 'New title saved elsewhere');
  await newEdit.getByRole('button', { name: '保存更改', exact: true }).click();
  await newEdit.waitFor({ state: 'hidden' });
  const edited = await saved();
  await oldEdit.getByRole('button', { name: '保存更改', exact: true }).click();
  await oldEdit.getByRole('alert').waitFor();
  assert.equal(await saved(), edited);
  assert.equal(await oldEdit.getByLabel('网站名称', { exact: true }).inputValue(), 'Unsaved old edit');
  await second.setViewportSize({ width: 320, height: 900 });
  await second.screenshot({ path: '/tmp/jigeqiu-library-tabs/edit-conflict-320.png' });
  await oldEdit.getByRole('button', { name: '取消', exact: true }).click();
  await second.getByRole('banner').getByRole('button', { name: '切换为英文', exact: true }).click();
  const englishNotice = second.getByRole('status', { name: 'Library update notice', exact: true });
  await englishNotice.waitFor();
  const reloadDialog = second.getByRole('dialog', { name: 'Reload the latest library?', exact: true });
  for (const dark of [false, true]) {
    const theme = second.getByRole('banner').getByRole('button', { name: dark ? 'Night mode' : 'Day mode', exact: true });
    if (await theme.count()) await theme.click();
    await englishNotice.getByRole('button', { name: 'Reload', exact: true }).click();
    await second.screenshot({ path: `/tmp/jigeqiu-library-tabs/reload-en-${dark ? 'dark' : 'light'}-320.png` });
    const box = await reloadDialog.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 320);
    assert.equal(await second.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await reloadDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  assert.deepEqual(errors, []);
  console.log('PASS real two-tab notice, draft download, refusal without writes, confirmed reload, retry, simultaneous forms and same-record edit conflict; zh/en/320/390px');
} finally {
  await browser?.close();
  await server.close();
}
