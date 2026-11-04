import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

// CI may provide Playwright externally without making it an application dependency.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== 'string');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();
  const origin = `http://127.0.0.1:${address.port}`;
  for (const page of [first, second]) {
    await page.goto(`${origin}/tests/browser/persistence.html`);
    await page.evaluate(async () => {
      const { createBrowserSnapshotStore } = await import('/src/services/persistence/browser-store.ts');
      window.store = createBrowserSnapshotStore();
      window.changes = [];
      window.off = window.store.subscribe((change) => window.changes.push(change));
      window.emptySnapshot = () => ({
        library: { bookmarks: [], folders: [], root: [] },
        layout: { shortcuts: [], folders: [], root: [], dock: [] },
        collections: [], trash: [],
      });
    });
  }
  assert.deepEqual(await first.evaluate(() => window.store.capability()), { mode: 'web-locks' });
  const initial = await first.evaluate(() => window.store.commit(null, window.emptySnapshot(), 'initial', 1));
  assert.equal(initial.ok, true);
  await second.waitForFunction(() => window.changes.some((change) => change.requiresReload && change.version?.revision === 1));
  console.log('PASS: real storage event invalidates the other page');

  // Both pages queue the same base while a third real native lock holds the gate.
  await first.evaluate(() => {
    window.lockReady = false;
    window.blocker = navigator.locks.request('jigeqiu:m1:persistence', () => {
      window.lockReady = true;
      return new Promise((resolve) => { window.releaseLock = resolve; });
    });
  });
  await first.waitForFunction(() => window.lockReady);
  for (const [page, id] of [[first, 'page-a'], [second, 'page-b']]) {
    await page.evaluate(({ version, id }) => {
      window.pending = window.store.commit(version, window.emptySnapshot(), id, 2);
    }, { version: initial.value.version, id });
  }
  await first.evaluate(() => window.releaseLock());
  const results = await Promise.all([
    first.evaluate(() => window.pending), second.evaluate(() => window.pending),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.find((result) => !result.ok).error.code, 'CONFLICT');
  const current = await second.evaluate(() => window.store.read());
  assert.equal(current.value.envelope.version.revision, 2);
  console.log('PASS: native Web Locks serialize competing same-revision commits; loser gets CONFLICT');

  await first.evaluate(() => localStorage.setItem('jigeqiu_assets_v1', '{broken-browser-data'));
  await second.waitForFunction(() => window.changes.some((change) => change.requiresReload && change.version === null));
  const corrupt = await second.evaluate(() => window.store.read());
  assert.equal(corrupt.error.code, 'CORRUPT_DATA');
  const overwrite = await second.evaluate(() => window.store.commit(null, window.emptySnapshot(), 'overwrite', 3));
  assert.equal(overwrite.ok, false);
  assert.equal(await first.evaluate(() => localStorage.getItem('jigeqiu_assets_v1')), '{broken-browser-data');
  console.log('PASS: malformed native storage survives read and rejected overwrite');

  await first.evaluate(() => localStorage.removeItem('jigeqiu_assets_v1'));
  await second.waitForFunction(() => window.store.read().then((result) => result.ok && result.value.kind === 'empty'));
  const stale = await second.evaluate((version) => window.store.commit(version, window.emptySnapshot(), 'stale', 4), current.value.envelope.version);
  assert.equal(stale.error.code, 'CONFLICT');
  console.log('PASS: a deleted snapshot is not recreated by a stale page');

  const beforeUnrelated = await second.evaluate(() => {
    window.unrelatedDelivered = false;
    window.addEventListener('storage', (event) => {
      if (event.key === 'unrelated') window.unrelatedDelivered = true;
    });
    return window.changes.length;
  });
  await first.evaluate(() => localStorage.setItem('unrelated', 'not-assets'));
  await second.waitForFunction(() => window.unrelatedDelivered);
  assert.equal(await second.evaluate(() => window.changes.length), beforeUnrelated);
  await second.evaluate(() => window.dispatchEvent(new Event('focus')));
  await second.waitForFunction((count) => window.changes.length > count, beforeUnrelated);
  const afterOff = await second.evaluate(() => {
    window.off();
    window.afterOffDelivered = false;
    window.addEventListener('storage', (event) => {
      if (event.key === 'jigeqiu_assets_v1') window.afterOffDelivered = true;
    });
    window.dispatchEvent(new Event('focus'));
    window.document.dispatchEvent(new Event('visibilitychange'));
    return window.changes.length;
  });
  await first.evaluate(() => localStorage.setItem('jigeqiu_assets_v1', '{after-unsubscribe'));
  // Use a native notification as a barrier, independent of the store's listener.
  await second.waitForFunction(() => window.afterOffDelivered);
  assert.equal(await second.evaluate(() => window.changes.length), afterOff);
  console.log('PASS: unrelated storage is ignored, focus invalidates, and unsubscribe detaches notifications');

  const noLocks = await browser.newContext();
  await noLocks.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined }));
  const restricted = await noLocks.newPage();
  await restricted.goto(`${origin}/tests/browser/persistence.html`);
  const unsupported = await restricted.evaluate(async () => {
    const { createBrowserSnapshotStore } = await import('/src/services/persistence/browser-store.ts');
    const store = createBrowserSnapshotStore();
    return { capability: store.capability(), result: await store.commit(null, {
      library: { bookmarks: [], folders: [], root: [] },
      layout: { shortcuts: [], folders: [], root: [], dock: [] }, collections: [], trash: [],
    }, 'no-lock', 1), count: localStorage.length };
  });
  assert.equal(unsupported.capability.mode, 'read-only');
  assert.equal(unsupported.result.error.code, 'LOCK_UNAVAILABLE');
  assert.equal(unsupported.count, 0);
  console.log('PASS: unavailable lock API explicitly rejects writes in an isolated browser context');

  const commandContext = await browser.newContext();
  const commandPage = await commandContext.newPage();
  await commandPage.goto(`${origin}/tests/browser/persistence.html`);
  const lifecycle = await commandPage.evaluate(async () => {
    const { createBrowserSnapshotStore } = await import('/src/services/persistence/browser-store.ts');
    window.store = createBrowserSnapshotStore();
    const created = await window.store.execute({
      commandId: 'create', expected: null, at: 1, actions: [
        { type: 'bookmark.create', id: 'b1', to: { parentId: null, index: 0 }, duplicates: 'reject', desktop: null,
          input: { title: 'Example', url: 'https://example.com/', icon: null, notes: 'Private secret', keywords: ['photo'] } },
        { type: 'desktop.pin', bookmarkId: 'b1', shortcutId: 'sc1', to: { kind: 'root', index: 0 } },
        { type: 'dock.pin', bookmarkId: 'b1', pinId: 'pin1', index: 0 },
        { type: 'collection.save', mode: 'create', collection: {
          id: 'col1', title: 'List', description: '', cover: null, provenance: [], createdAt: 1, updatedAt: 1,
          sections: [{ id: 'section1', title: '', description: '', items: [{
            id: 'item1', bookmarkId: 'b1', title: 'Public snapshot', url: 'https://example.org/',
            icon: null, recommendationReason: 'Public reason',
          }] }],
        } },
      ],
    });
    if (!created.ok) return { created };
    const deleted = await window.store.execute({
      commandId: 'delete', expected: created.value.envelope.version, at: 2,
      actions: [{ type: 'library.trash', refs: [{ kind: 'bookmark', id: 'b1' }], trashIds: ['trash1'] }],
    });
    if (!deleted.ok) return { created, deleted };
    const restored = await window.store.execute({
      commandId: 'restore', expected: deleted.value.envelope.version, at: 3,
      actions: [{ type: 'trash.restore', ids: ['trash1'] }],
    });
    if (!restored.ok) return { created, deleted, restored };
    const before = localStorage.getItem('jigeqiu_assets_v1');
    const failed = await window.store.execute({
      commandId: 'invalid-batch', expected: restored.value.envelope.version, at: 4,
      actions: [
        { type: 'library.folder.create', id: 'uncommitted', name: 'Must not persist', to: { parentId: null, index: 0 } },
        { type: 'dock.pin', bookmarkId: 'missing', pinId: 'bad-pin', index: 0 },
      ],
    });
    return { created, deleted, restored, failed, unchanged: before === localStorage.getItem('jigeqiu_assets_v1') };
  });
  assert.equal(lifecycle.created.ok, true);
  assert.equal(lifecycle.deleted.ok, true);
  assert.equal(lifecycle.restored.ok, true);
  const deletedSnapshot = lifecycle.deleted.value.envelope.snapshot;
  assert.equal(deletedSnapshot.library.bookmarks.length, 0);
  assert.equal(deletedSnapshot.layout.shortcuts.length, 0);
  assert.equal(deletedSnapshot.layout.dock.length, 0);
  assert.deepEqual(deletedSnapshot.collections[0].sections[0].items[0], {
    id: 'item1', bookmarkId: null, title: 'Public snapshot', url: 'https://example.org/',
    icon: null, recommendationReason: 'Public reason',
  });
  assert.equal(lifecycle.restored.value.envelope.snapshot.library.bookmarks[0].id, 'b1');
  assert.equal(lifecycle.restored.value.envelope.snapshot.layout.shortcuts.length, 0);
  assert.equal(lifecycle.failed.ok, false);
  assert.equal(lifecycle.unchanged, true);
  console.log('PASS: native command lifecycle keeps snapshots private, restores assets only, and rejects partial batches');

  const commandOtherPage = await commandContext.newPage();
  await commandOtherPage.goto(`${origin}/tests/browser/persistence.html`);
  await commandOtherPage.evaluate(async () => {
    const { createBrowserSnapshotStore } = await import('/src/services/persistence/browser-store.ts');
    window.store = createBrowserSnapshotStore();
  });
  const version = lifecycle.restored.value.envelope.version;
  const submissions = [commandPage, commandOtherPage].map((page, index) => page.evaluate(({ version, index }) => window.store.execute({
    commandId: `competing-${index}`, expected: version, at: 5,
    actions: [{ type: 'library.folder.create', id: `folder-${index}`, name: 'Folder', to: { parentId: null, index: 0 } }],
  }), { version, index }));
  const commands = await Promise.all(submissions);
  assert.equal(commands.filter((result) => result.ok).length, 1);
  assert.equal(commands.find((result) => !result.ok).error.code, 'CONFLICT');
  console.log('PASS: native command services on two pages cannot both overwrite the same base revision');

  const importContext = await browser.newContext();
  const importPage = await importContext.newPage();
  await importPage.goto(`${origin}/tests/browser/persistence.html`);
  const exchanged = await importPage.evaluate(async (source) => {
    const { createBrowserSnapshotStore } = await import('/src/services/persistence/browser-store.ts');
    const { createJsonImportService } = await import('/src/services/import-export/json-import-service.ts');
    const { exportAssets } = await import('/src/services/import-export/exchange.ts');
    window.store = createBrowserSnapshotStore();
    window.importService = createJsonImportService(window.store);
    const exported = exportAssets(source, { kind: 'all' }, 10);
    if (!exported.ok) return { exported };
    const parsed = window.importService.parseJson(JSON.stringify(exported.value));
    if (!parsed.ok) return { exported, parsed };
    window.importOptions = {
      target: { kind: 'existing', folderId: null }, duplicateBookmarks: 'skip',
      duplicateCollections: 'skip-identical', folderBindings: [],
      missingParents: 'reject', missingBookmarkLinks: 'reject',
    };
    window.emptySnapshot = () => ({
      library: { bookmarks: [], folders: [], root: [] },
      layout: { shortcuts: [], folders: [], root: [], dock: [] }, collections: [], trash: [],
    });
    const preview = window.importService.preview(parsed.value, window.importOptions, {
      base: window.emptySnapshot(), expected: null, previewId: 'browser-import', at: 11,
      candidateIds: ['new-bookmark', 'new-collection', 'new-section', 'new-item'],
    });
    const untouched = localStorage.length === 0;
    if (!preview.ok) return { exported, parsed, preview, untouched };
    const committed = await window.importService.commit(preview.value);
    if (!committed.ok) return { exported, parsed, preview, untouched, committed };
    const single = exportAssets(committed.value.receipt.envelope.snapshot, { kind: 'collection', id: 'new-collection' }, 12);
    return { exported, preview, untouched, committed, single };
  }, lifecycle.created.value.envelope.snapshot);
  assert.equal(exchanged.exported.ok, true);
  assert.equal(exchanged.preview.ok, true, JSON.stringify(exchanged));
  assert.equal(exchanged.untouched, true);
  assert.equal(exchanged.committed.ok, true, JSON.stringify(exchanged));
  const imported = exchanged.committed.value.receipt.envelope.snapshot;
  assert.equal(imported.library.bookmarks[0].notes, 'Private secret');
  assert.deepEqual(imported.layout, { shortcuts: [], folders: [], root: [], dock: [] });
  assert.equal(imported.collections[0].sections[0].items[0].bookmarkId, 'new-bookmark');
  assert.equal(exchanged.single.ok, true);
  assert.equal(JSON.stringify(exchanged.single).includes('Private secret'), false);
  assert.equal(exchanged.single.value.collections[0].sections[0].items[0].bookmarkId, null);
  console.log('PASS: native JSON exchange preserves private assets locally and excludes them from a single collection export');

  const tampered = await importPage.evaluate(async () => {
    const current = await window.store.read();
    window.importDocument = {
      format: 'json', notices: [], collections: [], roots: [{
        kind: 'bookmark', sourceId: 'source-race', input: {
          title: 'Another import', url: 'https://example.net/', icon: null, notes: '', keywords: [],
        },
      }],
    };
    const preview = window.importService.preview(window.importDocument, window.importOptions, {
      base: current.value.envelope.snapshot, expected: current.value.envelope.version,
      previewId: 'tampered-import', at: 13, candidateIds: ['tampered-bookmark'],
    });
    if (!preview.ok) return { preview };
    preview.value.next.library.bookmarks[0].notes = 'Forged overwrite';
    const before = localStorage.getItem('jigeqiu_assets_v1');
    return {
      result: await window.importService.commit(preview.value),
      unchanged: before === localStorage.getItem('jigeqiu_assets_v1'),
    };
  });
  assert.equal(tampered.result.error.code, 'IMPORT_INVALID');
  assert.equal(tampered.unchanged, true);
  console.log('PASS: altered native import preview cannot overwrite existing assets');

  const importOtherPage = await importContext.newPage();
  await importOtherPage.goto(`${origin}/tests/browser/persistence.html`);
  const importSetup = await importPage.evaluate(() => ({ document: window.importDocument, options: window.importOptions }));
  for (const [page, suffix] of [[importPage, 'left'], [importOtherPage, 'right']]) {
    const prepared = await page.evaluate(async ({ setup, suffix }) => {
      const { createBrowserSnapshotStore } = await import('/src/services/persistence/browser-store.ts');
      const { createJsonImportService } = await import('/src/services/import-export/json-import-service.ts');
      window.store = createBrowserSnapshotStore();
      window.importService = createJsonImportService(window.store);
      const current = await window.store.read();
      const preview = window.importService.preview(setup.document, setup.options, {
        base: current.value.envelope.snapshot, expected: current.value.envelope.version,
        previewId: `race-${suffix}`, at: 14, candidateIds: [`race-bookmark-${suffix}`],
      });
      if (preview.ok) window.importPreview = preview.value;
      return preview.ok;
    }, { setup: importSetup, suffix });
    assert.equal(prepared, true);
  }
  await importPage.evaluate(() => {
    window.importGateReady = false;
    window.importGate = navigator.locks.request('jigeqiu:m1:persistence', () => {
      window.importGateReady = true;
      return new Promise(resolve => { window.releaseImportGate = resolve; });
    });
  });
  await importPage.waitForFunction(() => window.importGateReady);
  for (const page of [importPage, importOtherPage]) {
    await page.evaluate(() => { window.importPending = window.importService.commit(window.importPreview); });
  }
  const replacement = await importPage.evaluate(async () => {
    const current = await window.store.read();
    const before = localStorage.getItem('jigeqiu_assets_v1');
    const result = window.importService.preview(window.importPreview.document, window.importPreview.options, {
      base: current.value.envelope.snapshot, expected: current.value.envelope.version,
      previewId: 'replacement-while-saving', at: 15, candidateIds: ['replacement-bookmark'],
    });
    return { result, unchanged: before === localStorage.getItem('jigeqiu_assets_v1') };
  });
  assert.equal(replacement.result.error.code, 'CONFLICT');
  assert.equal(replacement.unchanged, true);
  console.log('PASS: a native lock-queued import refuses replacement preview until confirmation settles');
  await importPage.evaluate(() => window.releaseImportGate());
  const imports = await Promise.all([importPage, importOtherPage].map(page => page.evaluate(() => window.importPending)));
  assert.equal(imports.filter(result => result.ok).length, 1);
  assert.equal(imports.find(result => !result.ok).error.code, 'PREVIEW_STALE');
  const finalImportState = await importPage.evaluate(() => window.store.read());
  assert.equal(finalImportState.value.envelope.version.revision, 2);
  assert.equal(finalImportState.value.envelope.snapshot.library.bookmarks.length, 2);
  console.log('PASS: competing native import confirmations produce one success and one PREVIEW_STALE');

  const htmlContext = await browser.newContext();
  const htmlPage = await htmlContext.newPage();
  await htmlPage.goto(`${origin}/tests/browser/persistence.html`);
  const forbiddenRequests = [];
  await htmlContext.route('https://never-fetch.invalid/**', route => {
    forbiddenRequests.push(route.request().url());
    return route.abort();
  });
  const html = await readFile(new URL('../fixtures/synthetic-bookmarks.html', import.meta.url), 'utf8');
  const htmlResult = await htmlPage.evaluate(async (html) => {
    const { createBrowserSnapshotStore } = await import('/src/services/persistence/browser-store.ts');
    const { createImportService } = await import('/src/services/import-export/import-service.ts');
    const service = createImportService(createBrowserSnapshotStore());
    const beforeDom = document.documentElement.outerHTML;
    const beforeKeys = localStorage.length;
    const malformed = service.parseHtml('<DL><DT><A HREF="javascript:1"><H3>Must not disappear</H3></A></DL>');
    const parsed = service.parseHtml(html);
    if (!parsed.ok) return { parsed };
    const parseUnchanged = document.documentElement.outerHTML === beforeDom && localStorage.length === beforeKeys;
    const preview = service.preview(parsed.value, {
      target: { kind: 'existing', folderId: null }, duplicateBookmarks: 'skip',
      duplicateCollections: 'skip-identical', folderBindings: [],
      missingParents: 'reject', missingBookmarkLinks: 'reject',
    }, {
      base: {
        library: { bookmarks: [], folders: [], root: [] },
        layout: { shortcuts: [], folders: [], root: [], dock: [] }, collections: [], trash: [],
      },
      expected: null, previewId: 'html-browser-import', at: 20,
      candidateIds: ['html-root', 'html-folder', 'html-child', 'html-empty', 'html-same'],
    });
    if (!preview.ok) return { parsed, preview, parseUnchanged };
    const beforeCommit = localStorage.length === beforeKeys;
    const committed = await service.commit(preview.value);
    return { parsed, malformed, preview, committed, parseUnchanged, beforeCommit, scriptRan: globalThis.__bookmarkScriptRan === true };
  }, html);
  assert.equal(htmlResult.parsed.ok, true, JSON.stringify(htmlResult));
  assert.equal(htmlResult.preview.ok, true, JSON.stringify(htmlResult));
  assert.equal(htmlResult.malformed.ok, false);
  assert.equal(htmlResult.malformed.error.code, 'IMPORT_INVALID');
  assert.equal(htmlResult.parseUnchanged, true);
  assert.equal(htmlResult.beforeCommit, true);
  assert.equal(htmlResult.scriptRan, false);
  // Two animation frames are a browser turn barrier, not a network timeout assumption.
  await htmlPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.deepEqual(forbiddenRequests, []);
  console.log('PASS: synthetic HTML parses without script execution, DOM insertion, storage writes or external resource requests');
  assert.equal(htmlResult.committed.ok, true, JSON.stringify(htmlResult));
  assert.deepEqual(htmlResult.committed.value.counts, { created: 5, skipped: 1, invalid: 1 });
  const htmlSnapshot = htmlResult.committed.value.receipt.envelope.snapshot;
  assert.deepEqual(htmlSnapshot.library.root, [
    { kind: 'bookmark', id: 'html-root' }, { kind: 'folder', id: 'html-folder' }, { kind: 'folder', id: 'html-same' },
  ]);
  assert.equal(htmlSnapshot.library.bookmarks[0].title, 'Root & One');
  assert.equal(htmlSnapshot.library.bookmarks[0].url, 'https://example.org/?a=1&b=2#first');
  assert.deepEqual(htmlSnapshot.library.folders.map(folder => [folder.name, folder.children]), [
    ['Same', [{ kind: 'bookmark', id: 'html-child' }, { kind: 'folder', id: 'html-empty' }]],
    ['Empty', []], ['Same', []],
  ]);
  assert.deepEqual(htmlSnapshot.layout, { shortcuts: [], folders: [], root: [], dock: [] });
  console.log('PASS: synthetic HTML tree imports with mixed order, independent same-name/empty folders and accurate rejection/dedup counts');
  console.log(`Browser: Chromium ${browser.version()}; all 14 integration scenarios passed`);
} finally {
  await browser?.close();
  await server.close();
}
