import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Result } from '../../src/domain/assets/model';
import { createImportService } from '../../src/services/import-export/import-service';
import type { ImportDocument, ImportOptions } from '../../src/services/import-export/model';
import { previewImport } from '../../src/services/import-export/preview';
import { ASSET_LIMITS } from '../../src/domain/assets/validation';
import { ASSET_KEY, createSnapshotStore } from '../../src/services/persistence/snapshot-store';
import { emptySnapshot } from '../support/asset-fixtures';
import { MemoryStorage } from '../support/memory-storage';

function take<T>(result: Result<T>): T {
  if (!result.ok) assert.fail(JSON.stringify(result));
  return result.value;
}
const options: ImportOptions = {
  target: { kind: 'existing', folderId: null }, duplicateBookmarks: 'skip',
  duplicateCollections: 'skip-identical', folderBindings: [], missingParents: 'reject', missingBookmarkLinks: 'reject',
};
function context() {
  return { base: emptySnapshot(), expected: null, previewId: 'html-import', at: 1, candidateIds: ['b1', 'f1', 'b2', 'b3'] };
}
function setup() {
  const storage = new MemoryStorage();
  const store = createSnapshotStore({
    storage: () => storage, locks: { async runExclusive(_name, task) { return task(); } }, newStoreId: () => 'store',
  });
  return { storage, store, service: createImportService(store) };
}
function document(format: 'html' | 'json' = 'html'): ImportDocument {
  return {
    format, roots: [], collections: [],
    notices: [{ code: 'INVALID_HTML_BOOKMARK', details: { sourceId: 'invalid-1', url: 'javascript:alert(1)', reason: 'unsupported-protocol' } }],
  };
}

test('HTML invalid-bookmark notices contribute one count per rejected source entry, not per arbitrary number', () => {
  const source = document();
  source.notices.push({
    code: 'INVALID_HTML_BOOKMARK', details: { sourceId: 'invalid-2', url: 'data:text/plain,bad', reason: 'unsupported-protocol' },
  });
  const preview = take(previewImport(source, options, context()));
  assert.deepEqual(preview.counts, { created: 0, skipped: 0, invalid: 2 });
  assert.deepEqual(preview.notices, source.notices);
});

test('JSON cannot inject HTML rejection counts through an informational notice', () => {
  assert.equal(take(previewImport(document('json'), options, context())).counts.invalid, 0);
});

test('HTML invalid-item notice requires exact bounded fields and a unique nonasset source identity', () => {
  const variants = [
    { sourceId: 'invalid-1', url: 'javascript:1', reason: '' },
    { sourceId: 1, url: 'javascript:1', reason: 'bad' },
    { sourceId: 'invalid-1', url: 1, reason: 'bad' },
    { sourceId: 'invalid-1', url: 'javascript:1', reason: 'bad', count: 999 },
    { sourceId: 'invalid-1', reason: 'bad' },
  ];
  for (const details of variants) {
    const source = document();
    source.notices[0].details = details as never;
    assert.equal(previewImport(source, options, context()).ok, false, JSON.stringify(details));
  }
  const duplicate = document();
  duplicate.notices.push(structuredClone(duplicate.notices[0]));
  assert.equal(previewImport(duplicate, options, context()).ok, false);
  const collision = document();
  collision.roots.push({
    kind: 'folder', sourceId: 'invalid-1', name: 'Folder', children: [],
  });
  assert.equal(previewImport(collision, options, context()).ok, false);
});

test('invalid HTML entries consume the same source-node budget as successfully parsed assets', () => {
  const source = document();
  source.notices = Array.from({ length: ASSET_LIMITS.nodes }, (_, index) => ({
    code: 'INVALID_HTML_BOOKMARK', details: {
      sourceId: `invalid-${index}`, url: 'javascript:1', reason: 'unsupported-protocol',
    },
  }));
  const limit = take(previewImport(source, options, context()));
  assert.equal(limit.counts.invalid, ASSET_LIMITS.nodes);
  source.roots.push({ kind: 'folder', sourceId: 'valid-folder', name: '', children: [] });
  const rejected = previewImport(source, options, context());
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.error.code, 'IMPORT_TOO_LARGE');
});

test('structured HTML parsing feeds the same zero-write preview and protected commit path', async () => {
  const { service, storage, store } = setup();
  const parsed = take(service.parseHtml(`<!DOCTYPE NETSCAPE-Bookmark-file-1>
    <DL><DT><A HREF="https://example.org/?a=1&amp;b=2#part">Root</A>
    <DT><H3>Folder</H3><DL>
      <DT><A HREF="javascript:alert(1)">Unsafe</A>
      <DT><A HREF="https://example.net:8443/">Child</A>
    </DL></DL>`));
  assert.equal(storage.length, 0);
  const preview = take(service.preview(parsed, options, context()));
  assert.equal(storage.length, 0);
  assert.equal(preview.counts.invalid, 1);
  assert.equal(preview.next.library.folders.length, 1);
  assert.equal(preview.next.library.bookmarks.length, 2);
  const report = take(await service.commit(preview));
  assert.equal(report.counts.invalid, 1);
  assert.equal(report.receipt.envelope.version.revision, 1);
  assert.equal(take(await store.read()).kind, 'ready');
  assert.deepEqual(report.receipt.envelope.snapshot.layout, emptySnapshot().layout);
  assert.equal(JSON.parse(storage.getItem(ASSET_KEY)!).snapshot.library.bookmarks[0].url, 'https://example.org/?a=1&b=2#part');
});

test('HTML and JSON previews share one ticket and cannot bypass busy or replacement semantics', async () => {
  const { service } = setup();
  const parsed = take(service.parseHtml('<DL><DT><A HREF="https://example.org/">HTML</A></DL>'));
  const first = take(service.preview(parsed, options, context()));
  const second = take(service.preview({
    format: 'json', roots: [], collections: [], notices: [],
  }, options, { ...context(), previewId: 'json-import', candidateIds: [] }));
  const old = await service.commit(first);
  assert.equal(old.ok, false);
  if (!old.ok) assert.equal(old.error.code, 'IMPORT_INVALID');
  const pending = service.commit(second);
  const busy = service.preview(parsed, options, context());
  assert.equal(busy.ok, false);
  if (!busy.ok) assert.equal(busy.error.code, 'CONFLICT');
  take(await pending);
});
