import assert from 'node:assert/strict';
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
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.evaluate(async () => {
    const react = await import('/node_modules/.vite/deps/react.js');
    const dom = await import('/node_modules/.vite/deps/react-dom_client.js');
    const React = react.default ?? react;
    const ReactDOM = dom.default ?? dom;
    const { FolderTreeSelect } = await import('/src/components/common/FolderTreeSelect.tsx');
    document.body.innerHTML = '<main id="folder-ime-fixture"></main>';
    window.folderIME = { creations: [], selections: [], submits: 0 };
    const folder = (id, name, parentId) => ({
      id, name, parentId, order: 0, bookmarkIds: [], pinnedToDesktop: false, createdAt: 0, updatedAt: 0,
    });
    ReactDOM.createRoot(document.querySelector('#folder-ime-fixture')).render(
      React.createElement('form', {
        onSubmit(event) { event.preventDefault(); window.folderIME.submits++; },
      }, React.createElement(FolderTreeSelect, {
        folders: [folder('parent', 'Parent'), folder('child', 'Child', 'parent')],
        language: 'en',
        onChange(id) { window.folderIME.selections.push(id ?? null); },
        onCreateFolder(name, parentId) {
          window.folderIME.creations.push({ name, parentId: parentId ?? null });
          return folder('created', name, parentId);
        },
      }), React.createElement('button', { type: 'submit' }, 'Save bookmark')),
    );
  });

  const trigger = page.getByRole('button', { name: /Bookmark location/ });
  const root = page.getByRole('treeitem', { name: 'Library root', exact: true });
  const parent = page.getByRole('treeitem', { name: 'Library root / Parent', exact: true });
  const input = page.getByRole('textbox', { name: 'New folder name' });
  const dispatch = (target, key, variant) => target.evaluate((element, { key, variant }) => {
    const event = new KeyboardEvent('keydown', {
      key, bubbles: true, cancelable: true,
      isComposing: variant === 'composing',
      keyCode: variant === 'legacy' ? 229 : 0,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }, { key, variant });

  await trigger.click();
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
  await input.fill('中文文件夹');
  for (const variant of ['composing', 'legacy']) {
    assert.equal(await dispatch(input, 'Enter', variant), true, `${variant}: block implicit form submission`);
    assert.deepEqual(await page.evaluate(() => window.folderIME.creations), [], `${variant}: no folder persisted`);
    assert.deepEqual(await page.evaluate(() => window.folderIME.selections), [], `${variant}: no selection`);
    assert.equal(await input.count(), 1, `${variant}: preserve the composition draft`);
    assert.equal(await input.inputValue(), '中文文件夹');
    assert.equal(await input.evaluate(element => element === document.activeElement), true);
    assert.equal(await page.evaluate(() => window.folderIME.submits), 0);
  }
  await input.press('Enter');
  await page.getByRole('tree').waitFor({ state: 'hidden' });
  assert.deepEqual(await page.evaluate(() => window.folderIME.creations), [{ name: '中文文件夹', parentId: null }]);
  assert.equal(await page.evaluate(() => window.folderIME.submits), 0);

  for (const variant of ['composing', 'legacy']) {
    await dispatch(trigger, 'ArrowDown', variant);
    assert.equal(await page.getByRole('tree').count(), 0, `${variant}: composing arrows do not open picker`);
    await trigger.click();
    await root.focus();
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape']) {
      await dispatch(root, key, variant);
      assert.equal(await root.evaluate(element => element === document.activeElement), true, `${variant}: ignore ${key}`);
      assert.equal(await page.getByRole('tree').count(), 1);
    }
    await parent.focus();
    await dispatch(parent, 'ArrowRight', variant);
    assert.equal(await parent.getAttribute('aria-expanded'), 'false');
    await parent.press('ArrowRight');
    assert.equal(await parent.getAttribute('aria-expanded'), 'true');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await dispatch(parent, 'ArrowLeft', variant);
    assert.equal(await parent.getAttribute('aria-expanded'), 'true');
    const search = page.getByRole('searchbox', { name: 'Search folders' });
    await search.fill('Child');
    for (const key of ['ArrowDown', 'ArrowUp', 'Escape']) {
      await dispatch(search, key, variant);
      assert.equal(await search.evaluate(element => element === document.activeElement), true);
      assert.equal(await search.inputValue(), 'Child');
    }
    await search.press('Escape');
    assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
  }
  assert.deepEqual(await page.evaluate(() => window.folderIME.selections), ['created']);
  assert.equal(await page.evaluate(() => window.folderIME.submits), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: composing and keyCode 229 Enter never create or submit; normal Enter creates once; composing tree/trigger/search keys are ignored.');
} finally {
  await browser?.close();
  await server.close();
}
