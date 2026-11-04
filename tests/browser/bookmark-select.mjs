import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**/*', route => route.fulfill({ body: '' }));
  const url = `http://127.0.0.1:${server.httpServer.address().port}/tests/browser/bookmark-select.html`;
  await mkdir('/tmp/jigeqiu-bookmark-select', { recursive: true });
  for (const width of [1280, 390, 320]) {
    for (const dark of [false, true]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      await page.evaluate(dark => {
        document.documentElement.classList.toggle('dark', dark);
        document.documentElement.classList.toggle('dark-glass', dark);
      }, dark);
      const single = page.getByRole('button', { name: /单选网址/ });
      const multi = page.getByRole('button', { name: /多选网址/ });
      await single.click();
      const tree = page.getByRole('tree');
      assert.equal(await tree.getByRole('treeitem').count(), 5);
      assert.equal(await tree.getByRole('checkbox').count(), 0);
      await tree.getByRole('treeitem', { name: '工作', exact: true }).click();
      assert.equal(await tree.getByRole('treeitem').count(), 2);
      await tree.getByRole('treeitem', { name: '工作', exact: true }).click();
      await tree.getByRole('treeitem', { name: 'GitHub', exact: true }).click();
      assert.equal(await tree.count(), 0);
      assert.equal(await page.getByLabel('单选结果').textContent(), 'git');
      await multi.click();
      assert.equal(await tree.getByRole('checkbox').count(), 3);
      await tree.getByRole('treeitem', { name: 'GitHub', exact: true }).click();
      assert.equal(await tree.getByRole('checkbox', { name: '选择收藏 git', exact: true }).isChecked(), true);
      const search = page.getByRole('combobox');
      if (dark) {
        const color = await tree.getByRole('treeitem', { name: '工作', exact: true })
          .evaluate(el => getComputedStyle(el).color);
        assert.notEqual(color, 'rgb(2, 6, 23)', 'Night folder labels must not use light-mode black');
        const background = await search.evaluate(el => getComputedStyle(el).backgroundColor);
        assert.notEqual(background, 'rgba(255, 255, 255, 0.95)', 'Night search cannot inherit the day input fill');
      }
      await search.fill('docs.test');
      assert.equal(await tree.getByRole('treeitem').count(), 2);
      await tree.getByRole('checkbox', { name: '选择收藏 docs', exact: true }).check();
      assert.equal(await page.getByLabel('多选结果').textContent(), 'git,docs');
      await search.fill('不存在');
      assert.equal(await tree.getByRole('status').textContent().then(value => value.trim()), '没有匹配的收藏');
      await search.fill('开发');
      assert.equal(await tree.getByRole('treeitem').count(), 3);
      await search.dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
      assert.equal(await page.getByLabel('多选结果').textContent(), 'git,docs');
      await search.press('Escape');
      assert.equal(await tree.count(), 0);
      assert.ok(await multi.evaluate(el => el === document.activeElement));
      await multi.click();
      assert.equal(await tree.getByRole('checkbox', { name: '选择收藏 git', exact: true }).isChecked(), true);
      await page.screenshot({ path: `/tmp/jigeqiu-bookmark-select/${width}-${dark ? 'dark' : 'light'}.png` });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.getByRole('button', { name: '外部按钮' }).click();
      assert.equal(await tree.count(), 0);
      await single.click();
      await page.getByRole('combobox').fill('github');
      await page.getByRole('combobox').press('ArrowDown');
      await page.getByRole('treeitem', { name: '开发', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
      assert.equal(await tree.count(), 0);
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS bookmark tree single/multiple, directories, search persistence, IME, keyboard, outside/Escape, day/night and 320/390px');
} finally {
  await browser?.close();
  await server.close();
}
