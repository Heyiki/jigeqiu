import assert from 'node:assert/strict';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.route('https://**/*', route => route.fulfill({ body: '' }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.getByRole('button', { name: '记个球首页', exact: true }).waitFor();
  for (const dark of [false, true]) {
    await page.evaluate(dark => document.documentElement.classList.toggle('dark-glass', dark), dark);
    for (const button of await page.locator('header button').all()) {
      assert.equal(await button.evaluate(el => getComputedStyle(el).cursor), 'pointer',
        'Logo and navigation buttons use the hand cursor in both themes');
    }
    const cursors = await page.evaluate(() => {
      const fixture = document.createElement('div');
      fixture.innerHTML = `
        <a href="#cursor-test">Link</a><button>Button</button>
        <button disabled>Disabled</button><a href="#" aria-disabled="true">Disabled link</a>
        <input type="text"><textarea></textarea><div>Background</div>
        <button class="cursor-grab">Drag</button>
        <button class="cursor-grabbing">Dragging</button>
        <div role="button" tabindex="0">Action</div>
        <input type="checkbox"><select><option>One</option></select>
        <fieldset disabled><button>Inherited disabled</button></fieldset>`;
      document.body.append(fixture);
      const result = [...fixture.children].map(el => getComputedStyle(el).cursor);
      result[result.length - 1] = getComputedStyle(fixture.querySelector('fieldset button')).cursor;
      fixture.remove();
      return result;
    });
    assert.deepEqual(cursors, [
      'pointer', 'pointer', 'not-allowed', 'not-allowed', 'text', 'text', 'auto',
      'grab', 'grabbing', 'pointer', 'pointer', 'pointer', 'not-allowed',
    ]);
  }
  console.log('PASS logo/navigation/link hand cursors, disabled states, text inputs and drag overrides in both themes');
} finally {
  await browser?.close();
  await server.close();
}
