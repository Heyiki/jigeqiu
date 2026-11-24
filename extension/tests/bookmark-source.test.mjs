import assert from 'node:assert/strict';
import test from 'node:test';
import { readBookmarkBar, projectBookmarkBar, commitBookmarkBar } from '../bookmarks/model.ts';

import { bookmarkFixture } from './bookmark-fixture.mjs';

async function initial(f) {
  const snapshot = await readBookmarkBar(f.api);
  const state = projectBookmarkBar(snapshot);
  return { snapshot, state };
}

test('reads only the bookmark bar, preserves duplicate URLs and native special URLs', async () => {
  const f = bookmarkFixture();
  const { state } = await initial(f);
  assert.equal(state.library.bookmarks.length, 3);
  assert.equal(state.library.folders.length, 1);
  assert.equal(state.library.bookmarks.filter(b => b.url === 'https://example.com/').length, 2);
  assert.equal(state.library.bookmarks.find(b => b.title === 'Settings').url, 'chrome://settings/');
  assert.equal(state.library.bookmarks.some(b => b.title === 'Private'), false);
  assert.equal(f.calls.length, 0);
});

test('native changes replace core fields but retain app metadata and stable IDs', async () => {
  const f = bookmarkFixture();
  const { state } = await initial(f);
  const bookmark = state.library.bookmarks[0];
  bookmark.notes = 'My note';
  bookmark.icon = 'https://icons.test/icon.png';
  f.find('10').title = 'Renamed outside';
  const next = projectBookmarkBar(await readBookmarkBar(f.api), state);
  assert.equal(next.library.bookmarks[0].id, bookmark.id);
  assert.equal(next.library.bookmarks[0].notes, 'My note');
  assert.equal(next.library.bookmarks[0].title, 'Renamed outside');
});

test('creates nested folders and bookmarks, edits and moves using native IDs', async () => {
  const f = bookmarkFixture();
  const { snapshot, state } = await initial(f);
  const desired = structuredClone(state.library);
  const now = Date.now();
  desired.folders.push({ id: 'new-folder', name: 'New folder', bookmarkIds: ['new-bookmark'], order: 10, createdAt: now, updatedAt: now, pinnedToDesktop: false });
  desired.bookmarks.push({ ...desired.bookmarks[0], id: 'new-bookmark', title: 'New', url: 'https://new.test/', folderId: 'new-folder', order: 0 });
  desired.bookmarks[0].title = 'Edited';
  desired.bookmarks[0].folderId = 'new-folder';
  desired.folders.at(-1).bookmarkIds.push(desired.bookmarks[0].id);
  const next = await commitBookmarkBar(f.api, snapshot, state, desired);
  assert.equal(f.find('10').title, 'Edited');
  const root = f.find('1');
  const folder = root.children.find(n => n.title === 'New folder');
  assert.equal(folder.children.length, 2);
  assert.equal(next.library.bookmarks.find(b => b.id === 'new-bookmark').url, 'https://new.test/');
  const reread = projectBookmarkBar(await readBookmarkBar(f.api), next);
  assert.ok(reread.library.bookmarks.some(b => b.id === 'new-bookmark'));
  assert.equal(f.find('2').children[0].id, '14');
});

test('deletes and restores as a new native node without affecting other bookmarks', async () => {
  const f = bookmarkFixture();
  const { snapshot, state } = await initial(f);
  const removed = state.library.bookmarks[0];
  const desired = structuredClone(state.library);
  desired.bookmarks = desired.bookmarks.filter(b => b.id !== removed.id);
  const next = await commitBookmarkBar(f.api, snapshot, state, desired);
  assert.equal(f.find('10'), undefined);
  const restored = structuredClone(next.library);
  restored.bookmarks.push(removed);
  const after = await commitBookmarkBar(f.api, await readBookmarkBar(f.api), next, restored);
  assert.ok(after.library.bookmarks.some(b => b.id === removed.id));
  assert.notEqual(after.ids[removed.id], '10');
  assert.equal(f.find('12').title, 'Another copy');
});

test('refuses a stale snapshot before any native writes', async () => {
  const f = bookmarkFixture();
  const { snapshot, state } = await initial(f);
  f.find('10').title = 'External edit';
  const desired = structuredClone(state.library);
  desired.bookmarks[0].title = 'Stale edit';
  await assert.rejects(commitBookmarkBar(f.api, snapshot, state, desired), /CONFLICT/);
  assert.equal(f.calls.length, 0);
  assert.equal(f.find('10').title, 'External edit');
});

test('metadata-only changes do not write to the native bookmark tree', async () => {
  const f = bookmarkFixture();
  const { snapshot, state } = await initial(f);
  const desired = structuredClone(state.library);
  desired.bookmarks[0].notes = 'Local metadata';
  const next = await commitBookmarkBar(f.api, snapshot, state, desired);
  assert.equal(f.calls.length, 0);
  assert.equal(next.library.bookmarks[0].notes, 'Local metadata');
});

test('a failed native operation reports uncertain state instead of pretending rollback', async () => {
  const f = bookmarkFixture();
  const { snapshot, state } = await initial(f);
  const desired = structuredClone(state.library);
  desired.bookmarks[0].title = 'Changed';
  f.api.update = async () => { throw new Error('Browser write failed'); };
  await assert.rejects(commitBookmarkBar(f.api, snapshot, state, desired), /COMMIT_UNCERTAIN/);
});

test('a concurrent external change during a native write cannot be reported as a clean commit', async () => {
  const f = bookmarkFixture();
  const { snapshot, state } = await initial(f);
  const desired = structuredClone(state.library);
  desired.bookmarks[0].title = 'Requested';
  const update = f.api.update;
  f.api.update = async (...args) => {
    const result = await update(...args);
    f.find('1').children.push({ id: '99', title: 'External addition', url: 'https://external.test/' });
    return result;
  };
  await assert.rejects(commitBookmarkBar(f.api, snapshot, state, desired), /COMMIT_UNCERTAIN/);
  assert.equal(f.find('99').title, 'External addition');
});

test('deep folder trees have a linear-size fingerprint', async () => {
  const f = bookmarkFixture();
  let node = f.find('1');
  for (let depth = 0; depth < 40; depth++) {
    const child = { id: `deep-${depth}`, title: 'Nested', children: [] };
    node.children.push(child);
    node = child;
  }
  const snapshot = await readBookmarkBar(f.api);
  assert.ok(snapshot.signature.length < 10000);
});

test('a metadata-only edit still rejects an externally changed native snapshot', async () => {
  const f = bookmarkFixture();
  const { snapshot, state } = await initial(f);
  const desired = structuredClone(state.library);
  desired.bookmarks[0].notes = 'Local note';
  f.find('10').title = 'Concurrent native edit';
  await assert.rejects(commitBookmarkBar(f.api, snapshot, state, desired), /CONFLICT/);
  assert.equal(f.calls.length, 0);
});
