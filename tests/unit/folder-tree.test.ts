import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Folder } from '../../src/types';

const folder = (id: string, name: string, parentId?: string, order = 0): Folder => ({
  id, name, parentId, order, bookmarkIds: [], pinnedToDesktop: false, createdAt: 0, updatedAt: 0,
});
const sample = [
  folder('work', 'Work', undefined, 2),
  folder('design', 'Design', 'work', 2),
  folder('icons', 'Icons', 'design'),
  folder('code', 'Code', 'work', 1),
  folder('personal', 'Personal', undefined, 1),
];
const helper = () => import('../../src/components/common/folder-tree');

test('indexes paths for every collapsed descendant, with safe orphan and cyclic ancestry', async () => {
  const { indexFolderPaths } = await helper();
  const input = [...sample, folder('orphan', 'Orphan', 'missing'),
    folder('a', 'A', 'b'), folder('b', 'B', 'a')];
  const paths = indexFolderPaths(input);
  assert.equal(paths.size, input.length);
  assert.deepEqual(paths.get('icons')!.map(item => item.id), ['work', 'design', 'icons']);
  assert.deepEqual(paths.get('orphan')!.map(item => item.id), ['orphan']);
  for (const path of paths.values()) assert.equal(new Set(path.map(item => item.id)).size, path.length);
});

test('menu paths distinguish unorganized and missing folders with localized defaults', async () => {
  const { bookmarkLibraryPath } = await helper();
  assert.equal(bookmarkLibraryPath(sample, 'icons'), '全部收藏 / Work / Design / Icons');
  assert.equal(bookmarkLibraryPath(sample), '全部收藏 / 未整理');
  assert.equal(bookmarkLibraryPath(sample, 'missing'), '全部收藏 / 原文件夹不存在');
  assert.equal(bookmarkLibraryPath(sample, undefined, true), 'All bookmarks / Unorganized');
});

test('sorts siblings by order without mutating the source and exposes complete paths', async () => {
  const { buildFolderTree, visibleFolderRows } = await helper();
  const tree = buildFolderTree(sample);
  assert.deepEqual(tree.map(node => node.folder.id), ['personal', 'work']);
  const rows = visibleFolderRows(tree, new Set(['work', 'design']));
  assert.deepEqual(rows.map(row => row.node.folder.id), ['personal', 'work', 'code', 'design', 'icons']);
  assert.deepEqual(rows.at(-1)!.node.path.map(item => item.name), ['Work', 'Design', 'Icons']);
  assert.deepEqual(rows.map(row => row.depth), [1, 1, 2, 2, 3]);
  assert.deepEqual(sample.map(item => item.id), ['work', 'design', 'icons', 'code', 'personal']);
});

test('excludes descendants, including those in malformed cycles', async () => {
  const { buildFolderTree, visibleFolderRows } = await helper();
  const tree = buildFolderTree([...sample, folder('a', 'A', 'b'), folder('b', 'B', 'a')], ['work', 'a']);
  assert.deepEqual(visibleFolderRows(tree, new Set()).map(row => row.node.folder.id), ['personal']);
});

test('promotes orphans and breaks cycles without losing or duplicating folders', async () => {
  const { buildFolderTree, visibleFolderRows } = await helper();
  const input = [folder('orphan', 'Orphan', 'missing'), folder('a', 'A', 'b'),
    folder('b', 'B', 'a'), folder('self', 'Self', 'self'), folder('child', 'Child', 'b')];
  const rows = visibleFolderRows(buildFolderTree(input), new Set(input.map(item => item.id)));
  assert.equal(rows.length, 5);
  assert.equal(new Set(rows.map(row => row.node.folder.id)).size, 5);
  for (const row of rows) assert.equal(new Set(row.node.path.map(item => item.id)).size, row.node.path.length);
});

test('search retains ancestors and reveals matches even when all branches are collapsed', async () => {
  const { buildFolderTree, visibleFolderRows } = await helper();
  const tree = buildFolderTree(sample);
  const rows = visibleFolderRows(tree, new Set(), '  ICONS ');
  assert.deepEqual(rows.map(row => row.node.folder.id), ['work', 'design', 'icons']);
  assert.deepEqual(rows.map(row => row.expanded), [true, true, false]);
  assert.deepEqual(visibleFolderRows(tree, new Set(), 'nothing'), []);
  assert.deepEqual(visibleFolderRows(tree, new Set()).map(row => row.node.folder.id), ['personal', 'work']);
});

test('keyboard navigation includes root, expands branches, and returns to parents', async () => {
  const { buildFolderTree, visibleFolderRows, navigateFolderTree } = await helper();
  const tree = buildFolderTree(sample);
  const expanded = new Set<string>();
  let rows = visibleFolderRows(tree, expanded);
  assert.equal(navigateFolderTree(rows, undefined, expanded, 'ArrowDown').activeId, 'personal');
  assert.equal(navigateFolderTree(rows, 'personal', expanded, 'ArrowUp').activeId, undefined);
  const opened = navigateFolderTree(rows, 'work', expanded, 'ArrowRight');
  assert.ok(opened.expandedIds.has('work'));
  assert.equal(opened.activeId, 'work');
  assert.equal(expanded.size, 0);
  rows = visibleFolderRows(tree, opened.expandedIds);
  assert.equal(navigateFolderTree(rows, 'work', opened.expandedIds, 'ArrowRight').activeId, 'code');
  assert.equal(navigateFolderTree(rows, 'code', opened.expandedIds, 'ArrowLeft').activeId, 'work');
  assert.ok(!navigateFolderTree(rows, 'work', opened.expandedIds, 'ArrowLeft').expandedIds.has('work'));
  assert.equal(navigateFolderTree(rows, 'personal', expanded, 'ArrowLeft').activeId, undefined);
  assert.equal(navigateFolderTree(rows, 'work', expanded, 'Home').activeId, undefined);
  assert.equal(navigateFolderTree(rows, undefined, expanded, 'End').activeId, 'design');
  assert.equal(navigateFolderTree(rows, undefined, expanded, 'Enter').select, true);
});

test('Right Arrow never moves to a sibling when search hides all children', async () => {
  const { buildFolderTree, visibleFolderRows, navigateFolderTree } = await helper();
  const rows = visibleFolderRows(buildFolderTree([
    folder('first', 'Match first'), folder('child', 'Hidden child', 'first'),
    folder('second', 'Match second'),
  ]), new Set(), 'match');
  assert.equal(navigateFolderTree(rows, 'first', new Set(), 'ArrowRight').activeId, 'first');
});

test('trigger renders the full selected path, localized defaults, and an explicit root', async () => {
  const { FolderTreeSelect } = await import('../../src/components/common/FolderTreeSelect');
  const render = (props = {}) => renderToStaticMarkup(React.createElement(FolderTreeSelect, {
    folders: sample, onChange() {}, ...props,
  }));
  assert.match(render(), /收藏位置/);
  assert.match(render(), /收藏库根目录/);
  assert.match(render({ language: 'en' }), /Bookmark location/);
  assert.match(render({ language: 'en' }), /Library root/);
  assert.match(render({ value: 'icons' }), /收藏库根目录 \/ Work \/ Design \/ Icons/);
  assert.match(render({ value: 'icons' }), /aria-expanded="false"/);
  assert.match(render({ value: 'icons', excludedIds: ['work'] }), /收藏库根目录/);
  assert.doesNotMatch(render({ value: 'icons', excludedIds: ['work'] }), /Work \/ Design/);
  assert.match(render({ label: 'Destination', rootLabel: 'All bookmarks' }), /All bookmarks/);
});
