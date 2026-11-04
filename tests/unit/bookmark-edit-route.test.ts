import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { transformSync } from 'esbuild';
import { commitAndRefresh } from '../../src/services/library-mutation';

const source = readFileSync(new URL('../../src/PrototypeApp.tsx', import.meta.url), 'utf8');
test('legacy folder edit uses the same atomic save route and refreshes folder membership', () => {
  const declaration = source.match(/const handleUpdateBookmark = ([\s\S]*?\n  });/);
  assert.ok(declaration);
  const compiled = transformSync(`return (${declaration[1]});`, { loader: 'ts', target: 'es2022' }).code;
  const calls: unknown[][] = [];
  const bookmark = { id: 'one', title: 'Before', url: 'https://example.test/', folderId: 'a', notes: 'kept' };
  const storage = {
    getBookmarks: () => [bookmark],
    updateBookmark: (...args: unknown[]) => calls.push(['legacy', ...args]),
    saveManualBookmark: (...args: unknown[]) => calls.push(['atomic', ...args]),
  };
  const update = new Function('storage', 'mutateLibrary', 'showToast', compiled)(
    storage, (commit: () => unknown) => commitAndRefresh(commit, () => { calls.push(['refresh']); }), () => {},
  );
  update('one', { title: 'After', folderId: 'b' });
  assert.deepEqual(calls, [['atomic', { ...bookmark, title: 'After', folderId: 'b' }, 'one'], ['refresh']]);
  calls.length = 0;
  storage.saveManualBookmark = () => { throw new Error('Quota'); };
  assert.throws(() => update('one', { folderId: 'b' }), /Quota/);
  assert.deepEqual(calls, []);
});
