import assert from 'node:assert/strict';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ colorScheme: 'dark', viewport: { width: 1280, height: 900 } });
  await page.route('https://**/*', route => route.fulfill({ body: '' }));
  const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
  await page.goto(base);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('jipage_settings_v1', JSON.stringify({
      appearanceMode: 'light-glass', language: 'zh', wallpaperPreset: 'cyan-lake',
    }));
  });
  await page.goto(`${base}#/settings/appearance`);
  await page.reload();
  const mode = name => page.getByRole('button', { name: `选择外观：${name}`, exact: true });
  const checkTheme = async dark => {
    await page.waitForFunction(expected => document.documentElement.classList.contains('dark') === expected
      && document.documentElement.classList.contains('dark-glass') === expected, dark);
  };
  const savedMode = () => page.evaluate(() => JSON.parse(localStorage.getItem('jipage_settings_v1')).appearanceMode);
  await mode('日间模式').waitFor();
  await checkTheme(false);
  assert.equal(await mode('自动').count(), 1, 'Appearance settings offer automatic mode');
  await mode('自动').click();
  await checkTheme(true);
  assert.equal(await mode('自动').getAttribute('aria-pressed'), 'true');
  assert.equal(await savedMode(), 'auto');
  await page.emulateMedia({ colorScheme: 'light' });
  await checkTheme(false);
  await page.emulateMedia({ colorScheme: 'dark' });
  await checkTheme(true);
  assert.equal(await savedMode(), 'auto', 'System changes retain the automatic preference');
  await page.reload();
  await mode('自动').waitFor();
  await checkTheme(true);
  assert.equal(await mode('自动').getAttribute('aria-pressed'), 'true');
  const header = page.getByRole('banner');
  await header.getByRole('button', { name: '切换日间模式', exact: true }).click();
  await checkTheme(false);
  assert.equal(await savedMode(), 'light-glass');
  await header.getByRole('button', { name: '切换夜间模式', exact: true }).click();
  await checkTheme(true);
  assert.equal(await savedMode(), 'dark-glass');
  await header.getByRole('button', { name: '切换自动模式', exact: true }).click();
  assert.equal(await savedMode(), 'auto');
  assert.equal(await mode('自动').getAttribute('aria-pressed'), 'true');
  await page.emulateMedia({ colorScheme: 'light' });
  await checkTheme(false);
  const automaticButton = header.getByRole('button', { name: '切换日间模式', exact: true });
  assert.match(await automaticButton.getAttribute('title'), /自动.*跟随系统/);
  assert.equal(await automaticButton.locator('.lucide-monitor').count(), 1);
  await automaticButton.focus();
  await page.keyboard.press('Enter');
  assert.equal(await savedMode(), 'light-glass', 'Keyboard cycles to a manual preference');
  await mode('夜间模式').click();
  await page.emulateMedia({ colorScheme: 'light' });
  await checkTheme(true);
  assert.equal(await savedMode(), 'dark-glass');
  await mode('日间模式').click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await checkTheme(false);
  assert.equal(await savedMode(), 'light-glass');
  await mode('自动').click();
  await checkTheme(true);
  await page.setViewportSize({ width: 320, height: 844 });
  const bounds = await header.getByRole('button', { name: '切换日间模式', exact: true }).boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320, 'Theme button fits mobile');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  console.log('PASS automatic appearance follows system changes, persists, supports manual overrides and fits mobile');
} finally {
  await browser?.close();
  await server.close();
}
