import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageManager } from '../../src/services/storage';
import { MemoryStorage } from '../support/memory-storage';
import { buildCollectionData, collectionSections, exportSingleCollection } from '../../src/services/collection-content';
import type { Collection } from '../../src/types';

function setup() {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  const original: Collection = { id: 'local', title: 'Old', description: '', items: [],
    category: 'legacy', authorId: 'user-me', authorName: 'Me', visibility: 'private',
    isPinnedToDesktop: false, createdAt: 1, updatedAt: 1 };
  memory.setItem('jipage_bookmarks_v1', '[]');
  memory.setItem('jipage_folders_v1', '[]');
  memory.setItem('jipage_collections_v1', JSON.stringify([original]));
  memory.setItem('jipage_settings_v1', '{"language":"en"}');
  const manager = new StorageManager();
  manager.getCollections();
  return { manager, memory, original };
}

test('update persists authored content and timestamps without replacing other assets or settings', () => {
  const { manager, memory, original } = setup();
  const next = { ...original, ...buildCollectionData(original, 'Edited', 'Body', collectionSections(original)) };
  manager.updateCollection(next);
  const saved = new StorageManager().getCollections()[0];
  assert.equal(saved.title, 'Edited');
  assert.equal(saved.createdAt, 1);
  assert.ok(saved.updatedAt > 1);
  assert.equal(memory.getItem('jipage_settings_v1'), '{"language":"en"}');
  assert.deepEqual(manager.getBookmarks(), []);
});

test('failed update leaves stored collection unchanged and can be retried with the same draft', () => {
  const { manager, memory, original } = setup();
  const next = { ...original, title: 'Retry' };
  memory.failWrites = true;
  assert.throws(() => manager.updateCollection(next));
  assert.equal(manager.getCollections()[0].title, 'Old');
  memory.failWrites = false;
  manager.updateCollection(next);
  assert.equal(manager.getCollections()[0].title, 'Retry');
});

test('stale instance cannot update or delete content changed by another tab', () => {
  const { manager, original } = setup();
  const other = new StorageManager();
  other.getCollections();
  manager.updateCollection({ ...original, title: 'First tab' });
  assert.throws(() => other.updateCollection({ ...original, title: 'Second tab' }), /CONFLICT/);
  assert.throws(() => other.deleteCollection(original.id), /CONFLICT/);
  assert.equal(manager.getCollections()[0].title, 'First tab');
});

test('clone is deeply independent, preserves attribution and never keeps desktop pinning', () => {
  const { manager, original } = setup();
  const data = buildCollectionData(original, 'Old', '', collectionSections(original));
  manager.updateCollection({ ...original, ...data, isPinnedToDesktop: true });
  const source = manager.getCollections()[0];
  const clone = manager.cloneCollection(source);
  assert.equal(clone.isPinnedToDesktop, false);
  assert.notEqual(clone.id, source.id);
  assert.ok(clone.assetContent!.provenance.some(p => p.sourceId === source.id));
  clone.assetContent!.sections[0].description = 'Mutated';
  assert.equal(source.assetContent!.sections[0].description, '');
});

test('cloning a maximum-length title remains exportable and retains legacy original attribution', () => {
  const { manager, original } = setup();
  const clone = manager.cloneCollection({ ...original, title: 'X'.repeat(1024), clonedFromId: 'original-source' });
  assert.ok(clone.title.length <= 1024);
  assert.ok(clone.title.endsWith(' (副本)'));
  assert.ok(clone.assetContent!.provenance.some(source => source.sourceId === 'original-source'));
  assert.doesNotThrow(() => exportSingleCollection(clone));
  assert.doesNotThrow(() => manager.exportJsonBackup());
});

test('deleting only removes that collection and missing ids reject instead of claiming success', () => {
  const { manager, memory } = setup();
  manager.deleteCollection('local');
  assert.deepEqual(manager.getCollections(), []);
  assert.deepEqual(manager.getBookmarks(), []);
  assert.equal(memory.getItem('jipage_settings_v1'), '{"language":"en"}');
  assert.throws(() => manager.deleteCollection('local'), /NOT_FOUND/);
});
