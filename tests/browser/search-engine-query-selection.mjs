import assert from 'node:assert/strict';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const language of ['zh', 'en']) {
    const en = language === 'en';
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    await context.route('https://**/*', route => route.abort());
    await context.addInitScript(language => {
      localStorage.setItem('jipage_settings_v1', JSON.stringify({ language, reduceMotion: true }));
    }, language);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/#/settings/search-engines`);
    await page.getByRole('button', { name: en ? 'Custom engine' : '自定义引擎', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: en ? 'Add custom search engine' : '添加自定义搜索引擎' });
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 960 });
      for (const dark of [false, true]) {
        await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
        const token = dialog.locator('code').filter({ hasText: '{query}' });
        await token.scrollIntoViewIfNeeded();
        const rect = await token.evaluate(element => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const box = range.getBoundingClientRect();
          window.getSelection()?.removeAllRanges();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        });
        await page.mouse.move(rect.x, rect.y + rect.height / 2);
        await page.mouse.down();
        await page.mouse.move(rect.x + rect.width, rect.y + rect.height / 2, { steps: 12 });
        await page.mouse.up();
        assert.equal(await page.evaluate(() => window.getSelection()?.toString()), '{query}', `${language}/${width}/${dark}: mouse selection`);
        await page.keyboard.press('ControlOrMeta+c');
        const input = dialog.getByRole('textbox', { name: en ? 'Search URL template' : '搜索 URL 规则模板', exact: true });
        await input.fill('');
        await input.click();
        await page.keyboard.press('ControlOrMeta+v');
        assert.equal(await input.inputValue(), '{query}', 'Selected token copies and pastes unchanged');
        assert.equal(await dialog.isVisible(), true);
      }
    }
    await context.close();
  }
  console.log('PASS query token mouse selection and copy/paste: zh/en, light/dark, 320/390/1280px');
} finally {
  await browser?.close();
  await server.close();
}
