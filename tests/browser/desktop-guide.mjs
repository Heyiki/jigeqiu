import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
const screenshots = process.env.SCREENSHOT_DIR ?? 'test-results/screenshots';
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('https://**/*', route => route.fulfill({ body: '' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(6000);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('jipage_bookmarks_v1', '[]');
    localStorage.setItem('jipage_folders_v1', '[]');
    localStorage.setItem('jipage_settings_v1', JSON.stringify({ language: 'zh', showDock: true, appearanceMode: 'light-glass' }));
  });
  await page.reload();
  const search = page.getByRole('dialog', { name: '全局搜索', exact: true });
  const launchpad = page.getByRole('dialog', { name: '启动台', exact: true });
  const guide = page.getByRole('dialog', { name: '使用指南', exact: true });
  const add = page.getByRole('dialog').filter({ has: page.getByLabel('网址 URL', { exact: true }) });
  const home = page.getByRole('banner').getByRole('button', { name: '桌面', exact: true });
  for (const mod of ['Control', 'Meta']) {
    await home.focus();
    await page.keyboard.press(`${mod}+k`);
    await search.waitFor();
    const field = search.getByRole('combobox', { name: '搜索内容', exact: true });
    await field.fill('retained query');
    await page.keyboard.press(`${mod}+k`);
    assert.equal(await field.inputValue(), 'retained query');
    assert.equal(await field.evaluate(element => document.activeElement === element), true);
    await page.keyboard.press(`${mod}+Shift+Space`);
    await launchpad.waitFor();
    assert.equal(await search.count(), 0);
    await launchpad.getByRole('searchbox').fill('retained launchpad');
    await page.keyboard.press(`${mod}+Shift+Space`);
    assert.equal(await launchpad.getByRole('searchbox').inputValue(), 'retained launchpad');
    await page.keyboard.press(`${mod}+k`);
    await search.waitFor();
    assert.equal(await launchpad.count(), 0);
    await field.fill('https://example.org/guide');
    await page.keyboard.press(`${mod}+Shift+Enter`);
    await add.waitFor();
    assert.equal(await add.getByLabel('网址 URL', { exact: true }).inputValue(), 'https://example.org/guide');
    await page.keyboard.press(`${mod}+k`);
    assert.equal(await search.count(), 0, 'Form blocks other panels');
    await add.getByRole('button', { name: '取消', exact: true }).click();
    await home.focus();
    await page.keyboard.press(`${mod}+Shift+Enter`);
    await add.waitFor();
    await add.getByRole('button', { name: '取消', exact: true }).click();
  }
  await home.focus();
  await page.keyboard.press('/');
  await search.waitFor();
  assert.equal(await search.getByRole('combobox').inputValue(), '/');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '编辑桌面', exact: true }).click();
  await page.keyboard.press('Control+k');
  assert.equal(await search.count(), 0, 'Even an empty desktop in edit mode blocks panels');
  await page.keyboard.press('/');
  assert.equal(await search.count(), 0);
  await page.getByRole('button', { name: '完成编辑', exact: true }).click();
  await page.getByRole('button', { name: '使用指南', exact: true }).click();
  await guide.waitFor();
  assert.equal(await guide.getByRole('tab').count(), 4, 'Guide separates commands from keyboard shortcuts');
  const commandsTab = guide.getByRole('tab', { name: '快捷指令', exact: true });
  await commandsTab.click();
  const guidePanel = guide.getByRole('tabpanel');
  assert.deepEqual(await guidePanel.locator('dt code').allTextContents(),
    ['/all', '/setting', '/add', '/search', '/start', '/trash', '/theme', '/dark', '/light', '/help']);
  await guidePanel.getByText('同 /theme，保留的设置入口。', { exact: true }).waitFor();
  const beforeReading = await page.evaluate(() => ({ hash: location.hash, settings: localStorage.getItem('jipage_settings_v1') }));
  await guidePanel.locator('dt code').filter({ hasText: '/dark' }).click();
  assert.equal(await guide.isVisible(), true, 'Reading a command never executes it');
  assert.deepEqual(await page.evaluate(() => ({ hash: location.hash, settings: localStorage.getItem('jipage_settings_v1') })), beforeReading);
  await commandsTab.focus();
  for (const [key, label] of [
    ['End', '操作说明'], ['ArrowRight', '快速上手'], ['ArrowLeft', '操作说明'],
    ['Home', '快速上手'], ['ArrowRight', '快捷键'], ['ArrowRight', '快捷指令'],
  ]) {
    await page.keyboard.press(key);
    const selectedTab = guide.getByRole('tab', { name: label, exact: true });
    assert.equal(await selectedTab.getAttribute('aria-selected'), 'true');
    assert.equal(await selectedTab.evaluate(element => element === document.activeElement), true);
    assert.equal(await guidePanel.getAttribute('aria-labelledby'), await selectedTab.getAttribute('id'));
  }
  await guide.getByRole('tab', { name: '快捷键', exact: true }).click();
  await guide.getByText('Shift', { exact: true }).first().waitFor();
  await page.keyboard.press('Control+k');
  assert.equal(await search.count(), 0);
  await page.keyboard.press('Control+Shift+Space');
  assert.equal(await launchpad.count(), 0);
  await page.keyboard.press('Control+Shift+Enter');
  assert.equal(await add.count(), 0);
  await guide.getByRole('tab', { name: '操作说明', exact: true }).click();
  await guide.getByText('从桌面移除', { exact: true }).waitFor();
  await guide.getByText(/收藏移至管理中心回收站/).waitFor();
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press('Tab');
    assert.equal(await guide.evaluate(element => element.contains(document.activeElement)), true);
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: '使用指南', exact: true })
    .evaluate(element => document.activeElement === element), true);

  await mkdir(screenshots, { recursive: true });
  const scenarios = [[1440, 1000], [390, 844], [320, 740]].flatMap(([width, height]) =>
    [false, true].flatMap(en => [false, true].map(dark => ({ width, height, en, dark }))));
  for (const { width, height, en, dark } of scenarios) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: width === 320 ? 'reduce' : 'no-preference' });
    await page.evaluate(({ en, dark }) => {
      const settings = JSON.parse(localStorage.getItem('jipage_settings_v1'));
      localStorage.setItem('jipage_settings_v1', JSON.stringify({
        ...settings, language: en ? 'en-US' : 'zh', appearanceMode: dark ? 'dark-glass' : 'light-glass',
      }));
    }, { en, dark });
    await page.reload();
    const trigger = page.getByRole('button', { name: en ? 'User guide' : '使用指南', exact: true });
    await trigger.hover();
    await trigger.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const hoverStyle = await trigger.evaluate(element => {
      const style = getComputedStyle(element);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d');
      const rgb = color => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data);
      };
      return { background: rgb(style.backgroundColor), color: rgb(style.color) };
    });
    if (dark) {
      assert.ok(Math.max(...hoverStyle.background.slice(0, 3)) < 100,
        `Night help hover must retain a dark surface, received ${hoverStyle.background}`);
      assert.ok(Math.min(...hoverStyle.color.slice(0, 3)) > 200, 'Night help icon stays light');
    } else {
      assert.ok(Math.min(...hoverStyle.background.slice(0, 3)) > 200, 'Day help keeps its light hover');
    }
    await trigger.focus();
    assert.equal(await trigger.evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
    await page.screenshot({ path: `${screenshots}/desktop-help-hover-${width}-${en ? 'en' : 'zh'}-${dark ? 'dark' : 'light'}.png` });
    await page.mouse.move(0, 0);
    const triggerBounds = await trigger.boundingBox();
    const dockBounds = await page.getByTestId('bottom-dock').boundingBox();
    assert.ok(triggerBounds.x >= 0 && triggerBounds.x + triggerBounds.width <= width);
    assert.ok(triggerBounds.x >= dockBounds.x + dockBounds.width || triggerBounds.y + triggerBounds.height <= dockBounds.y,
      'Guide trigger never overlaps Dock');
    const opener = dark ? page.getByRole('button', { name: en ? 'Open search' : '打开搜索', exact: true }) : trigger;
    await opener.click();
    if (dark) {
      await search.getByRole('combobox').fill('/help');
      await search.getByRole('combobox').press('Enter');
    }
    const panel = page.getByRole('dialog', { name: en ? 'User guide' : '使用指南', exact: true });
    const materials = await panel.evaluate(element => {
      const probe = document.createElement('span');
      element.append(probe);
      probe.style.backgroundColor = 'transparent';
      const wash = getComputedStyle(probe).backgroundColor;
      probe.style.backgroundColor = 'var(--desktop-panel)';
      const surface = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        wash, surface,
        scrim: getComputedStyle(element.parentElement).backgroundColor,
        panel: getComputedStyle(element).backgroundColor,
      };
    });
    assert.equal(materials.scrim, materials.wash, 'Dialog does not tint the desktop twice');
    assert.equal(materials.panel, materials.surface, 'Dialog uses the shared desktop glass surface');
    for (const tab of en ? ['Getting started', 'Keyboard shortcuts', 'Commands', 'Actions'] : ['快速上手', '快捷键', '快捷指令', '操作说明']) {
      await panel.getByRole('tab', { name: tab, exact: true }).click();
      const bounds = await panel.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= height);
      assert.equal(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), true);
    }
    const commandTab = panel.getByRole('tab', { name: en ? 'Commands' : '快捷指令', exact: true });
    await commandTab.click();
    const tabs = panel.getByRole('tab');
    assert.equal(await tabs.evaluateAll(elements => new Set(elements.map(element => element.getBoundingClientRect().top)).size), 1,
      'All four tabs stay in one row');
    assert.equal(await tabs.evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth)), true);
    const splitWords = await tabs.evaluateAll(elements => {
      const context = document.createElement('canvas').getContext('2d');
      return elements.flatMap(element => {
        const style = getComputedStyle(element);
        context.font = style.font;
        const available = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        return element.textContent.split(/\s+/).filter(word => context.measureText(word).width > available + 0.5)
          .map(word => ({ word, width: context.measureText(word).width, available, font: style.font }));
      });
    });
    assert.deepEqual(splitWords, [], `Tab labels never split words at ${width}px, en=${en}, dark=${dark}`);
    const content = panel.getByRole('tabpanel');
    assert.equal(await content.locator('dt code').count(), 10);
    await content.locator('dt code').filter({ hasText: /^\/help$/ }).waitFor();
    await content.getByText(en ? 'Open the user guide' : '打开使用指南', { exact: true }).waitFor();
    await content.getByText(en ? 'Set and save night mode' : '设为夜间模式并保存', { exact: true }).waitFor();
    await content.getByText(en ? 'Set and save day mode' : '设为日间模式并保存', { exact: true }).waitFor();
    if (en) assert.doesNotMatch(await content.innerText(), /[\u3400-\u9fff]/, 'English guide contains no Chinese copy');
    await content.locator('li').last().scrollIntoViewIfNeeded();
    assert.equal(await content.locator('li').last().isVisible(), true, 'Command notes remain reachable by scrolling');
    await commandTab.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${screenshots}/desktop-guide-commands-${width}-${en ? 'en' : 'zh'}-${dark ? 'dark' : 'light'}.png`, fullPage: true });
    await page.keyboard.press('Escape');
    assert.equal(await opener.evaluate(element => document.activeElement === element), true);
  }
  await page.getByRole('banner').getByRole('button', { name: 'Manage', exact: true }).click();
  await page.keyboard.press('Control+k');
  assert.equal(await search.count(), 0, 'Management retains browser/native keyboard behavior');
  assert.equal(await page.getByRole('button', { name: 'User guide', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS four guide tabs, ten read-only commands, help entry, keyboard wrapping/focus, en-US, day/night, 1440/390/320px, reduced motion, Dock clearance and existing shortcuts');
} finally {
  await browser?.close();
  await server.close();
}
