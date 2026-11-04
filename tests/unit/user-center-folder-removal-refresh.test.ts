import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { transformSync } from 'esbuild';
import { commitAndRefresh } from '../../src/services/library-mutation';
import { preferenceSaveError } from '../../src/services/preference-save-error';
import { StorageManager } from '../../src/services/storage';
import { MemoryStorage } from '../support/memory-storage';
import { createTranslator } from '../../src/i18n';

const source = readFileSync(new URL('../../src/components/account/UserCenterView.tsx', import.meta.url), 'utf8');
const declaration = source.match(/const removeLibraryFolder = ([\s\S]*?\n  });/);
assert.ok(declaration);
const compiled = transformSync(`return (${declaration[1]});`, { loader: 'ts', target: 'es2022' }).code;
const libraryKey = 'jipage_library_v2';

function setup(failAfterRefresh = false, selectKeptFolder = false) {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  const manager = new StorageManager();
  const removing = manager.createFolder('Removing');
  const kept = manager.createFolder('Kept');
  let writes = 0;
  let reads = 0;
  let refreshed = false;
  let failure: { cause: unknown } | null = null;
  const calls: unknown[][] = [];
  const pending = { current: false };
  const set = memory.setItem.bind(memory);
  memory.setItem = (key, value) => {
    if (key === libraryKey) writes++;
    set(key, value);
  };
  const bindings = {
    removingFolder: removing,
    folderRemovalPending: pending,
    folderRemovalMounted: { current: true },
    setFolderRemovalBusy: (value: boolean) => calls.push(['busy', value]),
    setFolderRemovalError: (value: { cause: unknown } | null) => { failure = value; },
    withCollectionMutation: async (action: () => unknown) => action(),
    commitAndRefresh,
    storage: {
      deleteFolder: (id: string) => manager.deleteFolder(id),
      trashFolder: (id: string) => manager.trashFolder(id),
      getFolders: () => {
        reads++;
        if (refreshed && failAfterRefresh) throw new DOMException('Blocked after refresh', 'SecurityError');
        return manager.getFolders();
      },
    },
    onLibraryChanged: () => {
      manager.getFolders();
      refreshed = true;
      calls.push(['refresh']);
    },
    selectedFolderId: selectKeptFolder ? kept.id : removing.id,
    setSelectedFolderId: (value: string) => calls.push(['selection', value]),
    setSelectedBmIds: (value: string[]) => calls.push(['bookmarks', value]),
    setRemovingFolder: (value: unknown) => calls.push(['dialog', value]),
    onShowToast: (value: string) => calls.push(['toast', value]),
    userSettings: { language: 'en' },
    t: createTranslator('en'),
  };
  const remove = new Function(...Object.keys(bindings), compiled)(...Object.values(bindings)) as
    (mode: 'dissolve' | 'trash') => Promise<void>;
  return {
    remove, removing, manager, calls, pending,
    result: () => ({
      writes, reads, refreshed,
      errorCode: failure?.cause instanceof Error ? failure.cause.message : '',
      errorMessage: failure ? preferenceSaveError(failure.cause, 'en', 'library') : '',
    }),
  };
}

for (const mode of ['dissolve', 'trash'] as const) {
  test(`${mode}: post-commit folder read failure is uncertain, not an unsaved change`, async () => {
    const view = setup(true);
    await view.remove(mode);
    const result = view.result();
    assert.equal(result.writes, 1);
    assert.equal(result.refreshed, true);
    assert.equal(result.reads, 1);
    assert.equal(view.manager.getFolders().some(folder => folder.id === view.removing.id), false);
    assert.equal(result.errorCode, 'COMMIT_UNCERTAIN');
    assert.equal(result.errorMessage, preferenceSaveError(new Error('COMMIT_UNCERTAIN'), 'en', 'library'));
    assert.doesNotMatch(result.errorMessage, /not saved|not applied|then try again/i);
    assert.equal(view.calls.some(call => ['selection', 'bookmarks', 'dialog', 'toast'].includes(String(call[0]))), false);
    assert.equal(view.pending.current, false);
    assert.deepEqual(view.calls.at(-1), ['busy', false]);
  });

  test(`${mode}: successful refresh captures folders before switching selection and closing`, async () => {
    const view = setup();
    await view.remove(mode);
    assert.equal(view.result().writes, 1);
    assert.equal(view.result().reads, 1);
    assert.equal(view.result().errorMessage, '');
    assert.deepEqual(view.calls.slice(1, 5), [
      ['refresh'], ['selection', 'all'], ['bookmarks', []], ['dialog', null],
    ]);
    assert.equal(view.calls.filter(call => call[0] === 'toast').length, 1);
  });
}

test('folder removal preserves selection when the captured refreshed folder still exists', async () => {
  const view = setup(false, true);
  await view.remove('dissolve');
  assert.equal(view.calls.some(call => call[0] === 'selection'), false);
  assert.equal(view.result().writes, 1);
  assert.equal(view.result().reads, 1);
  assert.equal(view.calls.filter(call => call[0] === 'dialog').length, 1);
});
