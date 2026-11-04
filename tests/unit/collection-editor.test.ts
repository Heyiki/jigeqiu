import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import type { Bookmark, Collection } from '../../src/types';
import type { CollectionSection } from '../../src/domain/assets/model';
import * as collectionContent from '../../src/services/collection-content';
import { CollectionEditor } from '../../src/components/collections/CollectionEditor';
import { BookmarkTreeSelect } from '../../src/components/common/BookmarkTreeSelect';
import { bookmarkTreeRows } from '../../src/components/common/bookmark-tree';

const path = new URL('../../src/components/collections/CollectionEditor.tsx', import.meta.url);
const bookmark: Bookmark = {
  id: 'saved', title: 'Library site', url: 'https://example.com', domain: 'example.com',
  keywords: ['tools'], notes: 'PRIVATE-NOTE-DO-NOT-COPY', category: 'cat-inbox',
  collectionIds: [], pinnedToDesktop: false, order: 0, createdAt: 1, updatedAt: 1,
};
const sections: CollectionSection[] = [
  { id: 's1', title: 'First', description: 'Line one\nLine two <script>literal</script>', items: [
    { id: 'i1', bookmarkId: 'saved', title: 'One', url: 'https://one.test', icon: null, recommendationReason: 'Intro one' },
    { id: 'i2', bookmarkId: null, title: 'Two', url: 'https://two.test', icon: null, recommendationReason: 'Intro two' },
  ] },
  { id: 's2', title: 'Second', description: 'Second body', items: [] },
];
const collection: Collection = {
  id: 'original', title: 'Existing', description: 'Description', items: [], category: 'legacy',
  authorId: 'old', authorName: 'Old author', visibility: 'public', isPinnedToDesktop: false,
  createdAt: 1, updatedAt: 2, assetContent: { cover: null, provenance: [], sections },
};
function nodes(tree: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement<{ children?: React.ReactNode }>(tree)) return [];
  return [tree, ...nodes(tree.props.children)];
}
function harness(options: {
  collection?: Collection; language?: string;
  realService?: boolean;
  onSave?: (data: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>) => void | Promise<void>;
} = {}) {
  const state: any[] = [], refs: any[] = [], cleanup: (() => void)[] = [];
  let cursor = 0, refCursor = 0, sequence = 0;
  const calls: any[][] = [];
  const hooks = {
    ...React,
    useState(initial: any) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (value: any) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef(initial: any) { return refs[refCursor++] ?? (refs[refCursor - 1] = { current: initial }); },
    useEffect(effect: () => (() => void) | void) { if (!cleanup.length) { const result = effect(); if (result) cleanup.push(result); } },
    useMemo: (compute: () => unknown) => compute(),
    useId: () => 'editor',
  };
  const service = {
    collectionSections(value: Collection) {
      calls.push(['sections', value]);
      // Return the original to ensure the editor, not the test fixture, protects it.
      return value.assetContent!.sections;
    },
    bookmarkCollectionItem(value: Bookmark) {
      calls.push(['bookmark', value]);
      return { id: `added-${++sequence}`, bookmarkId: value.id, title: value.title, url: value.url, icon: null, recommendationReason: '' };
    },
    buildCollectionData(base: Collection | undefined, title: string, description: string, draft: CollectionSection[]) {
      calls.push(['build', base, title, description, structuredClone(draft)]);
      if (!title.trim()) throw new Error('INVALID_INPUT');
      return { ...collection, title: title.trim(), description, assetContent: { cover: null, provenance: [], sections: structuredClone(draft) } };
    },
  };
  const require = createRequire(path);
  const module = { exports: {} as { CollectionEditor: (props: object) => React.ReactElement<any> } };
  const code = transformSync(readFileSync(path, 'utf8'), { loader: 'tsx', format: 'cjs' }).code;
  new Function('require', 'module', 'exports', code)((id: string) => {
    if (id === 'react') return hooks;
    if (id === '../common/BookmarkTreeSelect') return { BookmarkTreeSelect };
    if (id === '../../services/collection-content') return options.realService ? collectionContent : service;
    return require(id);
  }, module, module.exports);
  const props = {
    allBookmarks: [bookmark], language: 'en', ...options,
    onSave: async (data: any) => { calls.push(['save', data]); await options.onSave?.(data); },
    onClose: () => calls.push(['close']),
  };
  const render = () => { cursor = 0; refCursor = 0; return module.exports.CollectionEditor(props); };
  const find = (label: string) => {
    if (label === 'Select bookmark saved' || label === '选择收藏 saved') {
      const selector = nodes(render()).find(node => node.type === BookmarkTreeSelect)!;
      return React.createElement('input', {
        checked: selector.props.value.includes('saved'),
        onChange: (event: { target: { checked: boolean } }) => selector.props.onChange(event.target.checked ? ['saved'] : []),
      });
    }
    const node = nodes(render()).find(node => node.props['aria-label'] === label);
    assert.ok(node, `Missing control: ${label}`);
    return node;
  };
  const change = (label: string, value: string) => find(label).props.onChange({ target: { value } });
  const click = (label: string) => find(label).props.onClick();
  const submit = () => nodes(render()).find(node => node.type === 'form')!.props.onSubmit({ preventDefault() {} });
  return { calls, render, find, change, click, submit, unmount: () => cleanup.forEach(fn => fn()) };
}

test('new and existing editors render bilingual accessible forms through Modal with plain text sections', () => {
  for (const language of ['en', 'zh']) {
    const h = harness({ collection, language });
    const html = renderToStaticMarkup(h.render());
    assert.match(html, /role="dialog"/);
    assert.match(html, language === 'en' ? /Edit Collection/ : /编辑网址单/);
    assert.match(html, /required=""/);
    assert.match(html, /Line one\nLine two &lt;script&gt;literal&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>|PRIVATE-NOTE-DO-NOT-COPY|contenteditable|dangerouslySetInnerHTML/);
  }
  assert.match(renderToStaticMarkup(harness().render()), /New Collection/);
});

test('section and item fields can be edited, reordered and removed without mutating the source', async () => {
  const before = structuredClone(collection);
  const h = harness({ collection });
  h.change('Section 1 title', 'Changed first');
  h.change('Section 1 body', 'New body\nwith multiple lines');
  h.change('Item 1.1 title', 'Edited site');
  h.change('Item 1.1 URL', 'https://edited.test');
  h.change('Item 1.1 introduction', 'Public introduction');
  h.click('Move item 1.1 down');
  assert.equal(h.find('Item 1.2 title').props.value, 'Edited site');
  h.click('Move item 1.2 up');
  h.click('Move section 1 down');
  assert.equal(h.find('Section 2 title').props.value, 'Changed first');
  h.click('Move section 2 up');
  h.click('Delete item 1.2');
  h.click('Delete section 2');
  await h.submit();
  const build = h.calls.find(call => call[0] === 'build')!;
  assert.equal(build[1], collection);
  assert.equal(build[4].length, 1);
  assert.deepEqual(build[4][0], {
    id: 's1', title: 'Changed first', description: 'New body\nwith multiple lines',
    items: [{ ...sections[0].items[0], title: 'Edited site', url: 'https://edited.test', recommendationReason: 'Public introduction' }],
  });
  assert.deepEqual(collection, before);
  assert.deepEqual(h.calls.slice(-2).map(call => call[0]), ['save', 'close']);
});

test('bookmark selector searches public fields, targets a section and delegates safe snapshot conversion', async () => {
  const h = harness({ collection });
  const selector = nodes(h.render()).find(node => node.type === BookmarkTreeSelect)!;
  assert.deepEqual(bookmarkTreeRows([], selector.props.bookmarks, 'PRIVATE-NOTE-DO-NOT-COPY'), []);
  assert.equal(bookmarkTreeRows([], selector.props.bookmarks, 'tools').length, 1);
  h.change('Target section', 's2');
  h.find('Select bookmark saved').props.onChange({ target: { checked: true } });
  h.click('Add selected bookmarks');
  assert.equal(h.find('Item 2.1 title').props.value, bookmark.title);
  assert.equal(h.find('Item 2.1 introduction').props.value, '');
  await h.submit();
  assert.deepEqual(h.calls.find(call => call[0] === 'bookmark'), ['bookmark', bookmark]);
  assert.doesNotMatch(JSON.stringify(h.calls.find(call => call[0] === 'save')), /PRIVATE-NOTE-DO-NOT-COPY/);
});

test('manual URL entries and new sections are editable and invalid URLs do not remove draft data', async () => {
  const h = harness();
  h.change('Collection title', 'New list');
  h.click('Add section');
  h.change('Section 2 title', 'Manual');
  const target = nodes(h.render()).find(node => node.type === 'select')!;
  const second = nodes(target).filter(node => node.type === 'option')[1].props.value;
  h.change('Target section', second);
  h.change('Manual title', 'Manual site');
  h.change('Manual URL', 'javascript:alert(1)');
  h.click('Add URL');
  assert.match(renderToStaticMarkup(h.render()), /role="alert"/);
  assert.equal(h.find('Manual title').props.value, 'Manual site');
  h.change('Manual URL', 'example.org/docs');
  h.click('Add URL');
  assert.equal(h.find('Item 2.1 URL').props.value, 'https://example.org/docs');
  h.change('Item 2.1 introduction', 'Independent description');
  await h.submit();
  const item = h.calls.find(call => call[0] === 'build')![4][1].items[0];
  assert.equal(item.bookmarkId, null);
  assert.equal(item.recommendationReason, 'Independent description');
});

test('empty title and failed persistence retain the editable draft and allow retry', async () => {
  let fail = true;
  const h = harness({ onSave: async () => { if (fail) throw new Error('QUOTA_EXCEEDED'); } });
  await h.submit();
  assert.ok(!h.calls.some(call => call[0] === 'save'));
  h.change('Collection title', 'Draft to keep');
  await h.submit();
  assert.match(renderToStaticMarkup(h.render()), /role="alert"/);
  assert.equal(h.find('Collection title').props.value, 'Draft to keep');
  assert.ok(!h.calls.some(call => call[0] === 'close'));
  fail = false;
  await h.submit();
  assert.equal(h.calls.filter(call => call[0] === 'close').length, 1);
});

test('unchanged close is immediate, dirty close confirms for button, backdrop and Escape paths', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'confirm');
  const prompts: string[] = [];
  let accept = false;
  Object.defineProperty(globalThis, 'confirm', { configurable: true, value: (message: string) => {
    prompts.push(message); return accept;
  } });
  try {
    const h = harness({ collection });
    h.render().props.onClose();
    assert.equal(h.calls.filter(call => call[0] === 'close').length, 1);
    h.change('Collection description', 'Unsaved');
    h.render().props.onClose();
    h.click('Cancel');
    assert.equal(prompts.length, 2);
    assert.equal(h.calls.filter(call => call[0] === 'close').length, 1);
    accept = true;
    h.render().props.onClose();
    assert.equal(h.calls.filter(call => call[0] === 'close').length, 2);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'confirm', previous);
    else Reflect.deleteProperty(globalThis, 'confirm');
  }
});

test('saving blocks duplicate submission and closing, and unmount suppresses late callbacks', async () => {
  let finish!: () => void;
  const h = harness({ collection, onSave: () => new Promise<void>(resolve => { finish = resolve; }) });
  const pending = h.submit();
  await h.submit();
  h.render().props.onClose();
  assert.equal(h.calls.filter(call => call[0] === 'save').length, 1);
  assert.ok(!h.calls.some(call => call[0] === 'close'));
  h.unmount();
  finish();
  await pending;
  assert.ok(!h.calls.some(call => call[0] === 'close'));
});

test('normal SSR entry initializes the real service without accessing browser DOM or private notes', () => {
  const html = renderToStaticMarkup(React.createElement(CollectionEditor, {
    collection, allBookmarks: [bookmark], onSave() {}, onClose() {}, language: 'en',
  }));
  assert.match(html, /Edit Collection/);
  assert.match(html, /Intro one/);
  assert.doesNotMatch(html, /PRIVATE-NOTE-DO-NOT-COPY/);
});

test('real service creates a private collection with independent sections and bookmark snapshots', async () => {
  const h = harness({ realService: true });
  h.change('Collection title', '  My tools  ');
  h.change('Section 1 body', 'Text only\nsecond line');
  h.find('Select bookmark saved').props.onChange({ target: { checked: true } });
  h.click('Add selected bookmarks');
  await h.submit();
  const data = h.calls.find(call => call[0] === 'save')![1] as Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>;
  assert.equal(data.title, 'My tools');
  assert.equal(data.visibility, 'private');
  assert.equal(data.assetContent!.sections[0].description, 'Text only\nsecond line');
  assert.equal(data.assetContent!.sections[0].items[0].bookmarkId, bookmark.id);
  assert.equal(data.items[0].recommendationReason, '');
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE-NOTE-DO-NOT-COPY/);
});

test('real service validation errors identify missing item titles and invalid URLs without closing', async () => {
  for (const language of ['en', 'zh']) {
    const h = harness({ collection, realService: true, language });
    h.change(language === 'en' ? 'Item 1.1 title' : '条目名称 1.1', '');
    await h.submit();
    assert.match(renderToStaticMarkup(h.render()), language === 'en' ? /Every item needs a title/ : /每个条目都需要名称/);
    assert.ok(!h.calls.some(call => call[0] === 'save' || call[0] === 'close'));
    h.change(language === 'en' ? 'Item 1.1 title' : '条目名称 1.1', 'Recovered title');
    h.change(language === 'en' ? 'Item 1.1 URL' : '条目网址 1.1', 'javascript:alert(1)');
    await h.submit();
    assert.match(renderToStaticMarkup(h.render()), /HTTP/);
    assert.ok(!h.calls.some(call => call[0] === 'save' || call[0] === 'close'));
  }
});

test('Chinese controls expose agreed labels and field limits inside a contained modal', () => {
  const h = harness({ collection, language: 'zh' });
  assert.equal(h.render().props.contained, true);
  for (const [label, limit] of [
    ['网址单标题', 1024], ['简介', 32768], ['章节标题 1', 1024], ['章节正文 1', 32768],
    ['条目名称 1.1', 1024], ['条目网址 1.1', 8192], ['条目介绍 1.1', 32768],
  ] as const) assert.equal(h.find(label).props.maxLength, limit);
  for (const label of ['添加章节', '手动添加网址', '从收藏选择', '保存']) assert.equal(h.find(label).type, 'button');
});

test('real service content limits produce actionable errors and keep long text for correction', async () => {
  const h = harness({ collection, realService: true });
  const longTitle = 'x'.repeat(10000);
  h.change('Collection title', longTitle);
  await h.submit();
  assert.match(renderToStaticMarkup(h.render()), /Content is too long/);
  assert.equal(h.find('Collection title').props.value, longTitle);
  assert.ok(!h.calls.some(call => call[0] === 'save' || call[0] === 'close'));
});

test('pending manual title or URL blocks saving until added or cleared, keeping every draft field', async () => {
  for (const language of ['en', 'zh']) for (const field of ['title', 'url']) {
    const h = harness({ collection, language });
    const label = field === 'title'
      ? (language === 'en' ? 'Manual title' : '手动网址名称')
      : (language === 'en' ? 'Manual URL' : '手动网址 URL');
    const value = field === 'title' ? 'Pending title' : 'https://pending.test/';
    h.change(label, value);
    await h.submit();
    assert.match(renderToStaticMarkup(h.render()), language === 'en'
      ? /Add the manual URL or clear its fields before saving/
      : /请先添加手动网址或清空输入，再保存/);
    assert.equal(h.find(label).props.value, value);
    assert.ok(!h.calls.some(call => ['build', 'save', 'close'].includes(call[0])));
    h.change(label, '');
    await h.submit();
    assert.equal(h.calls.filter(call => call[0] === 'save').length, 1);
  }
});

test('pending bookmark selection blocks saving until added or deselected and survives the warning', async () => {
  for (const language of ['en', 'zh']) {
    const h = harness({ collection, language });
    const label = language === 'en' ? 'Select bookmark saved' : '选择收藏 saved';
    h.find(label).props.onChange({ target: { checked: true } });
    await h.submit();
    assert.match(renderToStaticMarkup(h.render()), language === 'en'
      ? /Add the selected bookmarks or deselect them before saving/
      : /请先添加选中的收藏或取消勾选，再保存/);
    assert.equal(h.find(label).props.checked, true);
    assert.ok(!h.calls.some(call => ['build', 'save', 'close'].includes(call[0])));
    h.click(language === 'en' ? 'Add selected bookmarks' : '从收藏选择');
    await h.submit();
    assert.equal(h.calls.filter(call => call[0] === 'save').length, 1);
  }
});

test('closing with pending bookmark selection confirms instead of silently discarding it', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'confirm');
  let prompted = false;
  Object.defineProperty(globalThis, 'confirm', { configurable: true, value: () => { prompted = true; return false; } });
  try {
    const h = harness({ collection });
    h.find('Select bookmark saved').props.onChange({ target: { checked: true } });
    h.render().props.onClose();
    assert.equal(prompted, true);
    assert.ok(!h.calls.some(call => call[0] === 'close'));
    assert.equal(h.find('Select bookmark saved').props.checked, true);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'confirm', previous);
    else Reflect.deleteProperty(globalThis, 'confirm');
  }
});
