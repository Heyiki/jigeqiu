import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { transformSync } from 'esbuild';
import { createTranslator } from '../../src/i18n';
import { commitAndRefresh } from '../../src/services/library-mutation';

test('manager delete notification follows English regional locale after one commit and refresh', async () => {
  const source = readFileSync(new URL('../../src/components/account/UserCenterView.tsx', import.meta.url), 'utf8');
  const handler = source.match(/const confirmBookmarkDeletion = ([\s\S]*?\n  });/);
  assert.ok(handler);
  const compiled = transformSync(`return (${handler[1]});`, { loader: 'ts' }).code;
  const calls: unknown[][] = [];
  const bindings = {
    pendingDeleteBookmarkIds: ['one', 'two'],
    libraryMutationPending: { current: false },
    folderRemovalMounted: { current: true },
    setLibraryMutationBusy: () => {},
    setDeleteBookmarkError: (value: { cause: unknown } | null) => { assert.equal(value, null); },
    setPendingDeleteBookmarkIds: () => {},
    setSelectedBmIds: () => {},
    storage: { deleteBookmarks: (ids: string[]) => { calls.push(['save', ids]); } },
    onLibraryChanged: () => { calls.push(['refresh']); },
    withCollectionMutation: async (action: () => unknown) => action(),
    commitAndRefresh,
    userSettings: { language: 'en-US' },
    t: createTranslator('en-US'),
    onShowToast: (message: string) => { calls.push(['toast', message]); },
  };
  const remove = new Function(...Object.keys(bindings), compiled)(...Object.values(bindings));
  await remove();
  assert.deepEqual(calls, [
    ['save', ['one', 'two']], ['refresh'], ['toast', 'Moved 2 bookmarks to the recycle bin'],
  ]);
});
