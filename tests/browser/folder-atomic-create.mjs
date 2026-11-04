import assert from 'node:assert/strict';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  const result = await page.evaluate(async () => {
    const { StorageManager } = await import('/src/services/storage.ts');
    const manager = new StorageManager();
    const old = manager.createFolder('Source');
    const bookmark = manager.saveManualBookmark({
      title: 'Atomic bookmark', url: 'https://atomic.example/', domain: 'atomic.example',
      category: 'cat-inbox', pinnedToDesktop: false, folderId: old.id, collectionIds: [], order: 0,
    });
    const before = localStorage.getItem('jipage_library_v2');
    const original = Storage.prototype.setItem;
    let writes = 0;
    let rejected = false;
    try {
      Storage.prototype.setItem = function (key, value) {
        if (key === 'jipage_library_v2') throw new DOMException('Full', 'QuotaExceededError');
        return original.call(this, key, value);
      };
      try { manager.createFolder('Destination', [bookmark.id]); }
      catch (error) { rejected = error.name === 'QuotaExceededError'; }
      const unchanged = localStorage.getItem('jipage_library_v2') === before;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'jipage_library_v2') writes++;
        return original.call(this, key, value);
      };
      const destination = manager.createFolder('Destination', [bookmark.id]);
      const data = JSON.parse(localStorage.getItem('jipage_library_v2'));
      return { rejected, unchanged, writes, destination: destination.id, bookmark: bookmark.id, data };
    } finally {
      Storage.prototype.setItem = original;
    }
  });
  assert.ok(result.rejected && result.unchanged, 'Quota failure leaves every asset unchanged');
  assert.equal(result.writes, 1);
  assert.equal(result.data.bookmarks[0].folderId, result.destination);
  assert.deepEqual(result.data.folders[0].bookmarkIds, []);
  assert.deepEqual(result.data.folders[1].bookmarkIds, [result.bookmark]);
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('jipage_library_v2')));
  assert.deepEqual(saved, result.data);
  console.log('PASS browser service atomic create-and-move, quota rollback/retry, one write, reload; no new combined-action UI claimed');
} finally {
  await browser?.close();
  await server.close();
}
