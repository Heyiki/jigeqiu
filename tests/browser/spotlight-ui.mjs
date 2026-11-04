import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('https://**/*', route => route.fulfill({ body: 'Search destination' }));
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('jipage_bookmarks_v1', JSON.stringify([{
      id: 'recent', title: 'Recent bookmark', url: 'https://recent.example.test/', domain: 'recent.example.test',
      category: 'cat-inbox', pinnedToDesktop: false, order: 0, collectionIds: [], keywords: [],
      createdAt: 1, updatedAt: 1,
    }]));
    localStorage.setItem('jipage_recent_used_v1', JSON.stringify(['recent']));
    localStorage.setItem('jipage_folders_v1', '[]');
    localStorage.setItem('jipage_search_engines_v1', JSON.stringify([
      { id: 'google', name: 'Google', keyword: 'g', urlTemplate: 'https://www.google.com/search?q={query}', isEnabled: true },
      { id: 'baidu', name: '百度', keyword: 'bd', urlTemplate: 'https://www.baidu.com/s?wd={query}', isEnabled: true },
      { id: 'duck', name: 'DuckDuckGo', keyword: 'ddg', urlTemplate: 'https://duckduckgo.com/?q={query}', isEnabled: true },
      { id: 'long', name: '很长的自定义搜索引擎名称 Developer Documentation', keyword: 'docs', urlTemplate: 'https://docs.example.test/?q={query}', isEnabled: true },
      { id: 'off', name: 'Disabled engine', keyword: 'off', urlTemplate: 'https://off.example.test/?q={query}', isEnabled: false },
    ]));
  });
  await page.reload();
  const home = page.getByRole('search', { name: '桌面搜索', exact: true });
  await home.getByRole('button', { name: /切换搜索引擎/ }).click();
  const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true });
  const input = dialog.getByRole('combobox', { name: '搜索内容', exact: true });
  const picker = dialog.getByRole('group', { name: '搜索引擎', exact: true });
  await picker.waitFor();
  assert.equal(await picker.getByRole('button', { name: 'Disabled engine', exact: true }).count(), 0);
  for (const [name, keyword] of [['Google', 'g'], ['百度', 'bd'], ['DuckDuckGo', 'ddg']]) {
    const choice = picker.getByRole('button', { name, exact: true });
    assert.equal(await choice.getByText(`/${keyword}`, { exact: true }).isVisible(), true,
      'Each engine displays its configured command');
    const nameBox = await choice.locator('[data-engine-name]').boundingBox();
    const commandBox = await choice.getByText(`/${keyword}`, { exact: true }).boundingBox();
    assert.ok(commandBox.y - (nameBox.y + nameBox.height) <= 3,
      'Command follows the name without a reserved blank line');
    const choiceBox = await choice.boundingBox();
    assert.ok(choiceBox.y + choiceBox.height - (commandBox.y + commandBox.height) <= 5,
      'Engine choice has compact bottom padding without reserved text space');
    const icon = await choice.locator('[data-engine-icon]').boundingBox();
    assert.ok(icon.width >= 44 && icon.height >= 44, 'Engine artwork uses more of the 56px tile');
  }
  await input.fill('液态玻璃 React & Tailwind');
  await dialog.getByRole('button', { name: /切换搜索引擎/ }).click();
  await dialog.getByRole('button', { name: /切换搜索引擎/ }).click();
  await picker.getByRole('button', { name: '百度', exact: true }).click();
  assert.equal(await input.inputValue(), '液态玻璃 React & Tailwind');
  assert.equal(await input.evaluate(element => document.activeElement === element), true);
  assert.equal(await picker.isVisible(), false);
  const inputBox = await input.boundingBox();
  const left = await dialog.getByRole('button', { name: /切换搜索引擎/ }).boundingBox();
  const right = await dialog.getByRole('button', { name: '搜索', exact: true }).boundingBox();
  assert.ok(left.x + left.width <= inputBox.x && inputBox.x + inputBox.width <= right.x,
    'Engine on the left, search action on the right');
  const popupFor = async action => {
    const waiting = context.waitForEvent('page');
    await action();
    const popup = await waiting;
    await popup.waitForLoadState();
    const url = popup.url();
    await popup.close();
    return url;
  };
  const clickedUrl = await popupFor(() => dialog.getByRole('button', { name: '搜索', exact: true }).click());
  assert.equal(new URL(clickedUrl).hostname, 'www.baidu.com');
  assert.equal(new URL(clickedUrl).searchParams.get('wd'), '液态玻璃 React & Tailwind');
  await home.getByRole('button', { name: /^(打开搜索|Open search)$/ }).click();
  await input.fill('液态玻璃 React & Tailwind');
  const enteredUrl = await popupFor(() => input.press('Enter'));
  assert.equal(enteredUrl, clickedUrl, 'Mouse button and Enter execute the same action');
  await home.getByRole('button', { name: '搜索', exact: true }).click();
  await input.fill('/bd 保留指令');
  await dialog.getByRole('button', { name: /切换搜索引擎/ }).click();
  await picker.getByRole('button', { name: 'DuckDuckGo', exact: true }).click();
  assert.equal(await input.inputValue(), '/bd 保留指令', 'Picking an engine cannot delete the draft');
  assert.equal(await input.evaluate(element => document.activeElement === element), true);
  await input.fill('');
  assert.equal(await dialog.getByRole('button', { name: '搜索', exact: true }).isDisabled(), true);
  await input.press('Enter');
  assert.equal(context.pages().length, 1, 'Unselected empty search cannot navigate');
  await input.press('ArrowDown');
  await dialog.getByRole('option', { name: /Recent bookmark/ }).waitFor();
  assert.equal(await dialog.getByRole('button', { name: '搜索', exact: true }).isEnabled(), true,
    'Explicitly selecting a recent bookmark enables execution even with no query');
  const recentUrl = await popupFor(() => input.press('Enter'));
  assert.equal(recentUrl, 'https://recent.example.test/');
  await home.getByRole('button', { name: /^(打开搜索|Open search)$/ }).click();
  await input.fill('输入法确认');
  await input.dispatchEvent('compositionstart');
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true, bubbles: true });
  assert.equal(context.pages().length, 1);
  assert.equal(await dialog.isVisible(), true);
  await input.dispatchEvent('compositionend');
  await dialog.getByRole('button', { name: /切换搜索引擎/ }).click();
  await page.keyboard.press('Escape');
  assert.equal(await picker.isVisible(), false);
  assert.equal(await dialog.isVisible(), true);
  assert.equal(await input.evaluate(element => document.activeElement === element), true);
  await dialog.getByRole('button', { name: /切换搜索引擎/ }).click();
  await picker.getByRole('button', { name: 'Google', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await picker.getByRole('button', { name: '百度', exact: true }).evaluate(element => document.activeElement === element), true);
  await page.keyboard.press('Enter');
  assert.equal(await input.evaluate(element => document.activeElement === element), true);
  const longQuery = '完整保留很长的搜索文字 React Tailwind '.repeat(25);
  await input.fill(longQuery);
  assert.equal(await input.inputValue(), longQuery);
  assert.ok(await input.evaluate(element => element.scrollWidth >= element.clientWidth));
  await input.fill('设计灵感');
  await mkdir('test-results/screenshots', { recursive: true });
  for (const [theme, width, height] of [['light', 1440, 1000], ['dark', 1440, 1000], ['mobile', 390, 844], ['narrow', 320, 720]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(dark => {
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.classList.toggle('dark-glass', dark);
    }, theme === 'dark');
    await dialog.getByRole('button', { name: /切换搜索引擎/ }).click();
    await picker.waitFor();
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y >= 0 && bounds.y + bounds.height <= height + 1);
    const field = await input.boundingBox();
    assert.ok(field.width >= (width <= 390 ? 160 : 440), `Usable input width ${field.width} at ${width}px`);
    for (const searchButton of [home.getByRole('button', { name: '搜索', exact: true }), dialog.getByRole('button', { name: '搜索', exact: true })]) {
      const glass = await searchButton.evaluate(element => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, blur: style.backdropFilter };
      });
      assert.match(glass.background, /^rgba\(/, 'Search button has a translucent surface');
      assert.match(glass.blur, /blur\(16px\)/, 'Search button blurs its backdrop');
    }
    const custom = picker.getByRole('button', { name: '很长的自定义搜索引擎名称 Developer Documentation', exact: true });
    const nameBounds = await custom.locator('[data-engine-name]').boundingBox();
    const commandBounds = await custom.getByText('/docs', { exact: true }).boundingBox();
    assert.ok(commandBounds.y >= nameBounds.y + nameBounds.height - 1, 'Command stays below the name');
    assert.equal(await custom.evaluate(element => element.scrollWidth > element.clientWidth), false);
    await page.screenshot({ path: `test-results/screenshots/spotlight-ui-${theme}.png`, fullPage: true });
    if (theme === 'light') await dialog.screenshot({ path: 'test-results/screenshots/spotlight-ui-preview.png' });
    await page.keyboard.press('Escape');
  }
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.reload();
  await home.getByRole('button', { name: '切换搜索引擎：百度', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS left engine/grid picker, mouse and Enter parity, input preservation/focus, IME/Escape/keyboard, light/dark and 390/320px layouts');
} finally {
  await browser?.close();
  await server.close();
}
