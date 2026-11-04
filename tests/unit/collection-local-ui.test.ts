import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import { CollectionsView } from '../../src/components/collections/CollectionsView';
import { CollectionDetailView } from '../../src/components/collections/CollectionDetailView';
import type { Bookmark, Collection } from '../../src/types';

const noop = () => {};
const original: Collection = {
  id: 'local', title: 'Local tools', description: 'Saved description', category: 'old-category',
  authorId: 'user-me', authorName: 'Mock Author', visibility: 'public',
  isPinnedToDesktop: true, createdAt: 1, updatedAt: 1,
  items: [{
    bookmarkId: 'site', title: 'Example', url: 'https://example.com', domain: 'example.com',
    order: 1, iconMode: 'text', recommendationReason: 'Community recommendation',
  }],
};
const legacyCopy = { ...original, id: 'copy', title: 'Legacy copy', isCloned: true, authorId: 'old-user' };
const listProps = {
  collections: [original, legacyCopy], categories: [], allBookmarks: [],
  onSelectCollection: noop, onCreateCollection: noop, onCloneCollection: noop,
  onDeleteCollection: noop, onTogglePinCollection: noop, onShareCollection: noop,
};
const detailProps = {
  collection: legacyCopy, userBookmarks: [], onBack: noop, onClone: noop,
  onShare: noop, onTogglePin: noop, onSaveBookmarkToMyLibrary: noop,
};
const markup = (component: React.ElementType, props: object) =>
  renderToStaticMarkup(React.createElement(component, props));

test('local list includes legacy copies and deletes every local record without social controls', () => {
  const html = markup(CollectionsView, { ...listProps, localOnly: true });
  assert.match(html, /Local tools/);
  assert.match(html, /Legacy copy/);
  assert.equal((html.match(/title="删除网址单"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /我创建的|我收藏的|我复制的|社区|分享|公开|Mock Author|固定|推荐/);
  assert.match(html, /title="复制为我的网址单"/);
  assert.match(html, /打开一组/);
  assert.equal(listProps.collections[1].visibility, 'public', 'Rendering must not rewrite old data');
});

test('local detail retains saved item descriptions and local actions without platform controls', () => {
  const html = markup(CollectionDetailView, { ...detailProps, localOnly: true });
  assert.doesNotMatch(html, /分享|公开|Mock Author|固定|推荐理由/);
  assert.match(html, /条目说明：Community recommendation/);
  for (const text of ['Legacy copy', 'Example', 'Saved description', '打开一组', '复制为我的网址单', '加入我的收藏', '访问']) {
    assert.ok(html.includes(text), text);
  }
});

test('embedded pages are unframed and use compact localized entry titles', () => {
  const list = markup(CollectionsView, { ...listProps, localOnly: true, embedded: true, language: 'en-US' });
  assert.doesNotMatch(list, /<h1\b|My Collections/);
  assert.match(list, /New Collection/);
  assert.doesNotMatch(list, /max-w-6xl|sm:px-8|网址单管理与分享/);
  const embeddedPlatform = markup(CollectionsView, { ...listProps, embedded: true });
  assert.doesNotMatch(embeddedPlatform, /<h1\b/);
  assert.match(embeddedPlatform, /新建网址单/);
  assert.match(markup(CollectionsView, { ...listProps, localOnly: true }), /我的网址单/);
  const detail = markup(CollectionDetailView, { ...detailProps, localOnly: true, embedded: true, language: 'en' });
  assert.match(detail, /Back to My Collections/);
  assert.doesNotMatch(detail, /max-w-4xl|sm:px-8|h-44|sm:h-52|shadow-xl/);
});

test('default platform rendering retains tabs, social actions, author and recommendations', () => {
  const list = markup(CollectionsView, listProps);
  assert.match(list, /网址单管理与分享/);
  assert.match(list, /我创建的/);
  assert.match(list, /复制分享链接/);
  assert.doesNotMatch(list, /Legacy copy/);
  const detail = markup(CollectionDetailView, detailProps);
  assert.match(detail, /分享/);
  assert.match(detail, /Mock Author/);
  assert.match(detail, /推荐理由/);
  assert.match(detail, /从桌面移除/);
});

// Run the real component with an in-memory hook dispatcher to exercise the form
// and callbacks without adding a DOM dependency to this Node-only test suite.
function listHarness(props: object) {
  const path = new URL('../../src/components/collections/CollectionsView.tsx', import.meta.url);
  const require = createRequire(path);
  const state: unknown[] = [];
  let cursor = 0;
  const hooks = {
    ...React,
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value: unknown) => {
        state[index] = typeof value === 'function' ? value(state[index]) : value;
      }];
    },
    useMemo: (compute: () => unknown) => compute(),
    useEffect: noop,
  };
  const compiled = transformSync(readFileSync(path, 'utf8'), { loader: 'tsx', format: 'cjs' }).code;
  const module = { exports: {} as { CollectionsView: (props: object) => React.ReactElement } };
  new Function('require', 'module', 'exports', compiled)(
    (id: string) => id === 'react' ? hooks : require(id), module, module.exports,
  );
  return () => {
    cursor = 0;
    return module.exports.CollectionsView(props);
  };
}

function elements(tree: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!React.isValidElement<{ children?: React.ReactNode }>(tree)) return [];
  return [tree, ...elements(tree.props.children)];
}

test('local creation hides platform fields and submits private even with legacy public defaults', () => {
  const created: Collection[] = [];
  const render = listHarness({
    ...listProps, localOnly: true,
    onCreateCollection: (value: Collection) => created.push(value),
  });
  elements(render()).find(node => node.type === 'button')!.props.onClick();
  let tree = render();
  const html = renderToStaticMarkup(tree);
  assert.doesNotMatch(html, /归属分类|分享可见性|展示在社区/);
  elements(tree).find(node => node.type === 'input')!.props.onChange({ target: { value: ' Private tools ' } });
  tree = render();
  elements(tree).find(node => node.type === 'form')!.props.onSubmit({ preventDefault: noop });
  assert.equal(created.length, 1);
  assert.equal(created[0].title, 'Private tools');
  assert.equal(created[0].visibility, 'private');
  assert.equal(created[0].isPinnedToDesktop, false);
});

test('local legacy records retain select, clone and delete callbacks', () => {
  const calls: unknown[] = [];
  const render = listHarness({
    ...listProps, localOnly: true,
    onSelectCollection: (value: Collection) => calls.push(['select', value]),
    onCloneCollection: (value: Collection) => calls.push(['clone', value]),
    onDeleteCollection: (id: string) => calls.push(['delete', id]),
  });
  const nodes = elements(render());
  const copies = nodes.filter(node => node.props.title === '复制为我的网址单');
  assert.equal(copies.length, 2);
  copies[1].props.onClick();
  nodes.find(node => node.type === 'div' && node.props.onClick && elements(node).some(child =>
    child.type === 'h3' && child.props.children === 'Legacy copy'))!.props.onClick();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'confirm');
  Object.defineProperty(globalThis, 'confirm', { configurable: true, value: () => true });
  try {
    const deletes = nodes.filter(node => node.props.title === '删除网址单');
    assert.equal(deletes.length, 2);
    deletes[1].props.onClick();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'confirm', previous);
    else Reflect.deleteProperty(globalThis, 'confirm');
  }
  assert.deepEqual(calls, [['clone', legacyCopy], ['select', legacyCopy], ['delete', 'copy']]);
});

test('local creation preserves the existing bookmark snapshot fields, including notes and icon intent', () => {
  const bookmark: Bookmark = {
    id: 'site', title: 'Example', url: 'https://example.com', domain: 'example.com',
    icon: 'https://example.com/custom.png', iconMode: 'custom', iconBg: '#123456',
    notes: 'Saved note', category: 'old', order: 1, collectionIds: [],
    pinnedToDesktop: false, createdAt: 1, updatedAt: 1,
  };
  const created: Collection[] = [];
  const render = listHarness({
    ...listProps, localOnly: true, allBookmarks: [bookmark],
    onCreateCollection: (value: Collection) => created.push(value),
  });
  elements(render()).find(node => node.type === 'button')!.props.onClick();
  const nodes = elements(render());
  nodes.find(node => node.type === 'input')!.props.onChange({ target: { value: 'Tools' } });
  nodes.find(node => node.props.multiple === true && Array.isArray(node.props.bookmarks))!.props.onChange([bookmark.id]);
  elements(render()).find(node => node.type === 'form')!.props.onSubmit({ preventDefault: noop });
  assert.deepEqual(created[0].items, [{
    bookmarkId: bookmark.id, title: bookmark.title, url: bookmark.url, domain: bookmark.domain,
    icon: bookmark.icon, iconMode: bookmark.iconMode, iconBg: bookmark.iconBg,
    order: 1, recommendationReason: bookmark.notes,
  }]);
});

test('local batch open receives every item in the selected legacy copy', () => {
  const render = listHarness({ ...listProps, localOnly: true });
  elements(render()).filter(node => node.props.title === '打开一组网址')[1].props.onClick();
  const modal = elements(render()).find(node =>
    typeof node.type === 'function' && node.type.name === 'BatchOpenModal');
  assert.ok(modal);
  assert.equal(modal.props.collectionTitle, legacyCopy.title);
  assert.equal(modal.props.items, legacyCopy.items);
});
