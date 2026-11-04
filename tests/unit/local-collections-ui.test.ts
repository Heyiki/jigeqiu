import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import type { Bookmark, Collection } from '../../src/types';

const noop = () => {};
const source = new URL('../../src/components/collections/LocalCollections.tsx', import.meta.url);
const collection: Collection = {
  id: 'reading', title: 'Reading list', description: 'First paragraph\nSecond paragraph',
  category: 'legacy', authorId: 'old-author', authorName: 'Legacy author', visibility: 'public',
  isPinnedToDesktop: true, createdAt: 1, updatedAt: 2,
  items: [],
  assetContent: {
    cover: { kind: 'symbol', symbol: 'book', color: '#008866' },
    provenance: [{ sourceId: 'source', title: 'Origin', author: null, url: null }],
    sections: [{
      id: 'research', title: 'Research section', description: 'Chapter line one\nChapter line two',
      items: [{
        id: 'paper', bookmarkId: 'original', title: 'Long paper', url: 'https://paper.example/read',
        recommendationReason: 'Item introduction\nSecond item line',
        icon: { kind: 'url', value: 'https://paper.example/icon.png', color: null, mode: 'custom' },
      }],
    }, { id: 'empty', title: 'Empty section', description: 'Still visible', items: [] }],
  },
};
const bookmark: Bookmark = {
  id: 'original', title: 'Private bookmark', url: 'https://paper.example/read',
  domain: 'paper.example', notes: 'PRIVATE NOTES MUST NOT BE COPIED', category: 'inbox',
  order: 1, collectionIds: [], pinnedToDesktop: false, createdAt: 1, updatedAt: 1,
};
const other: Collection = {
  ...collection, id: 'other', title: 'Other collection', description: '', assetContent: undefined, items: [],
};
const defaults = {
  collections: [collection, other], allBookmarks: [], language: 'en-US', activeCollection: null,
  onSelect: noop, onCreate: noop, onUpdate: noop, onDelete: noop, onClone: noop, onSaveBookmark: noop,
};

// Exercise real component handlers using the same lightweight hook harness as the
// existing Node UI tests. The lock boundary is controlled independently of UI state.
type MutationGate = (action: () => unknown, isCurrent: () => boolean) => Promise<unknown>;
function harness(overrides: object = {}, mutation: MutationGate = async (action, isCurrent) => {
  if (!isCurrent()) throw new Error('CANCELLED');
  return action();
}) {
  assert.ok(existsSync(source), 'LocalCollections component must implement the local workflow');
  const require = createRequire(source);
  const state: unknown[] = [];
  let cursor = 0;
  let unmounted = false;
  let lateWrites = 0;
  const effects = new Map<number, (() => void) | void>();
  const props = { ...defaults, ...overrides };
  const hooks = {
    ...React,
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (value: unknown) => {
        if (unmounted) lateWrites++;
        state[index] = typeof value === 'function' ? value(state[index]) : value;
      }];
    },
    useRef: (current: unknown) => {
      const index = cursor++;
      if (!(index in state)) state[index] = { current };
      return state[index];
    },
    useMemo: (compute: () => unknown) => compute(),
    useEffect(effect: () => (() => void) | void) {
      const index = cursor++;
      if (!effects.has(index)) effects.set(index, effect());
    },
  };
  const compiled = transformSync(readFileSync(source, 'utf8'), { loader: 'tsx', format: 'cjs' }).code;
  const module = { exports: {} as { LocalCollections: (props: object) => React.ReactElement } };
  const Editor = () => null;
  new Function('require', 'module', 'exports', compiled)(
    (id: string) => id === 'react' ? hooks
      : id === '../../services/collection-mutation' ? { withCollectionMutation: mutation }
      : id === './CollectionEditor' ? { CollectionEditor: Editor } : require(id),
    module, module.exports,
  );
  return {
    props,
    render() { cursor = 0; return module.exports.LocalCollections(props); },
    unmount() {
      unmounted = true;
      for (const cleanup of effects.values()) cleanup?.();
    },
    get lateWrites() { return lateWrites; },
    Editor,
  };
}

function elements(tree: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!React.isValidElement<{ children?: React.ReactNode }>(tree)) return [];
  return [tree, ...elements(tree.props.children)];
}
function control(tree: React.ReactNode, name: string) {
  const node = elements(tree).find(element =>
    element.type === 'button' && element.props['aria-label'] === name);
  assert.ok(node, `Expected action: ${name}`);
  return node;
}
const html = (tree: React.ReactNode) => renderToStaticMarkup(tree);
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };

test('list searches chapter bodies and item introductions without losing other records', () => {
  const view = harness();
  assert.match(html(view.render()), /Reading list/);
  const search = elements(view.render()).find(node => node.type === 'input' && node.props.type === 'search');
  assert.ok(search);
  for (const query of ['Reading', 'Second paragraph', 'Research section', 'Chapter line two',
    'Long paper', 'paper.example', 'Second item line']) {
    search.props.onChange({ target: { value: query } });
    const result = html(view.render());
    assert.match(result, /Reading list/);
    assert.doesNotMatch(result, /Other collection/);
  }
  search.props.onChange({ target: { value: 'absent term' } });
  assert.doesNotMatch(html(view.render()), /Reading list/);
  search.props.onChange({ target: { value: '' } });
  assert.match(html(view.render()), /Other collection/);
});

test('detail renders every chapter, multiline body and introduction without social metadata', () => {
  const view = harness({ activeCollection: collection });
  const result = html(view.render());
  for (const text of ['Research section', 'Empty section', 'Chapter line one\nChapter line two',
    'First paragraph\nSecond paragraph', 'Item introduction\nSecond item line']) assert.ok(result.includes(text), text);
  assert.match(result, /whitespace-pre-wrap/);
  assert.doesNotMatch(result, /Legacy author|PRIVATE NOTES|Community|Public|Follow/);
});

test('cards expose edit, clone, confirmed deletion and share independently of selection', async () => {
  const calls: unknown[] = [];
  const view = harness({
    onSelect: (value: Collection) => calls.push(['select', value.id]),
    onClone: (value: Collection) => calls.push(['clone', value]),
    onDelete: (id: string) => calls.push(['delete', id]),
  });
  control(view.render(), 'Open Reading list').props.onClick();
  await control(view.render(), 'Duplicate Reading list').props.onClick();
  assert.deepEqual(calls, [['select', 'reading'], ['clone', collection]]);
  control(view.render(), 'Delete Reading list').props.onClick();
  assert.equal(calls.length, 2, 'Delete requires an explicit confirmation');
  const confirmation = html(view.render());
  assert.match(confirmation, /cannot be undone/);
  assert.match(confirmation, /bookmarks.*not.*deleted/i);
  await control(view.render(), 'Confirm deletion').props.onClick();
  assert.deepEqual(calls.at(-1), ['delete', 'reading']);
});

test('clone and delete failures remain visible and retryable, with no false navigation', async () => {
  let attempts = 0;
  const view = harness({
    activeCollection: collection,
    onClone: async () => { throw new Error('Copy quota exceeded'); },
    onDelete: async () => { attempts++; throw new Error('Delete conflict'); },
    onSelect: () => assert.fail('Failed deletion must not leave the detail'),
  });
  await control(view.render(), 'Duplicate Reading list').props.onClick();
  assert.match(html(view.render()), /Copy quota exceeded/);
  control(view.render(), 'Delete Reading list').props.onClick();
  await control(view.render(), 'Confirm deletion').props.onClick();
  assert.match(html(view.render()), /Delete conflict/);
  await control(view.render(), 'Confirm deletion').props.onClick();
  assert.equal(attempts, 2);
});

test('repeated clone clicks while persistence is pending create only one copy', async () => {
  let count = 0;
  let finish!: () => void;
  const view = harness({
    onClone: () => { count++; return new Promise<void>(resolve => { finish = resolve; }); },
  });
  const button = control(view.render(), 'Duplicate Reading list');
  const first = button.props.onClick();
  const second = button.props.onClick();
  assert.equal(count, 1);
  assert.equal(control(view.render(), 'Duplicate Reading list').props.disabled, true);
  finish();
  await Promise.all([first, second]);
  assert.equal(control(view.render(), 'Duplicate Reading list').props.disabled, false);
});

test('successful detail deletion returns to the list only after persistence resolves', async () => {
  const calls: unknown[] = [];
  let finish!: () => void;
  const view = harness({
    activeCollection: collection,
    onDelete: () => new Promise<void>(resolve => { finish = resolve; }),
    onSelect: (value: unknown) => calls.push(value),
  });
  control(view.render(), 'Delete Reading list').props.onClick();
  const pending = control(view.render(), 'Confirm deletion').props.onClick();
  assert.equal(control(view.render(), 'Confirm deletion').props.disabled, true);
  assert.deepEqual(calls, []);
  finish();
  await pending;
  assert.deepEqual(calls, [null]);
});

test('creation and editing share the editor and preserve full collection metadata', async () => {
  const calls: unknown[] = [];
  const view = harness({
    onCreate: (value: unknown) => calls.push(['create', value]),
    onUpdate: (value: unknown) => calls.push(['update', value]),
  });
  control(view.render(), 'New collection').props.onClick();
  let editor = elements(view.render()).find(node => node.type === view.Editor);
  assert.ok(editor);
  const { id, createdAt, updatedAt, ...data } = collection;
  await editor.props.onSave(data);
  assert.deepEqual(calls[0], ['create', data]);
  assert.ok(!elements(view.render()).some(node => node.type === view.Editor));
  control(view.render(), 'Edit Reading list').props.onClick();
  editor = elements(view.render()).find(node => node.type === view.Editor);
  assert.ok(editor);
  assert.equal(editor.props.collection, collection);
  await editor.props.onSave({ ...data, title: 'Edited' });
  const updated = calls[1] as [string, Collection];
  assert.equal(updated[0], 'update');
  assert.equal(updated[1].id, 'reading');
  assert.equal(updated[1].createdAt, 1);
  assert.equal(updated[1].title, 'Edited');
  assert.deepEqual(updated[1].assetContent, collection.assetContent);
  assert.equal(collection.title, 'Reading list', 'Original object remains untouched');
});

test('failed editor persistence keeps the editor open and reports the failure', async () => {
  const view = harness({ onUpdate: async () => { throw new Error('Save conflict'); } });
  control(view.render(), 'Edit Reading list').props.onClick();
  const editor = elements(view.render()).find(node => node.type === view.Editor)!;
  await assert.rejects(editor.props.onSave(collection), /Save conflict/);
  assert.ok(elements(view.render()).some(node => node.type === view.Editor));
  assert.match(html(view.render()), /Save conflict/);
});

test('save uses the section snapshot, preserves icon intent and never copies bookmark notes', async () => {
  const saved: unknown[] = [];
  const view = harness({ activeCollection: collection, onSaveBookmark: (item: unknown) => saved.push(item) });
  await control(view.render(), 'Save Long paper').props.onClick();
  assert.deepEqual(saved, [{
    bookmarkId: 'original', title: 'Long paper', url: 'https://paper.example/read', domain: 'paper.example',
    icon: 'https://paper.example/icon.png', iconMode: 'custom', iconBg: undefined,
    recommendationReason: 'Item introduction\nSecond item line', order: 0,
  }]);
  assert.equal(control(view.render(), 'Already saved Long paper').props.disabled, true);
  const existing = harness({ activeCollection: collection, allBookmarks: [bookmark] });
  assert.equal(control(existing.render(), 'Already saved Long paper').props.disabled, true);
  assert.doesNotMatch(html(existing.render()), /PRIVATE NOTES/);
});

test('batch open receives all section items, not a stale legacy flat items array', () => {
  const view = harness({ activeCollection: collection });
  control(view.render(), 'Open all Reading list').props.onClick();
  const batch = elements(view.render()).find(node =>
    typeof node.type === 'function' && node.type.name === 'BatchOpenModal');
  assert.ok(batch);
  assert.equal(batch.props.collectionTitle, 'Reading list');
  assert.equal(batch.props.items.length, 1);
  assert.equal(batch.props.items[0].url, 'https://paper.example/read');
  assert.equal(batch.props.items[0].iconMode, 'custom');
  assert.equal(batch.props.language, 'en-US');
});

test('bookmark save failure remains retryable and does not show an already-saved state', async () => {
  const view = harness({
    activeCollection: collection, onSaveBookmark: () => { throw new Error('Bookmark quota exceeded'); },
  });
  await control(view.render(), 'Save Long paper').props.onClick();
  assert.match(html(view.render()), /Bookmark quota exceeded/);
  assert.equal(control(view.render(), 'Save Long paper').props.disabled, false);
});

test('sharing malformed legacy URLs shows an error instead of crashing the collection view', () => {
  const invalid: Collection = { ...other, id: 'invalid', title: 'Old links', items: [{
    bookmarkId: '', title: 'Invalid link', url: 'javascript:alert(1)', domain: '', order: 0,
  }] };
  const view = harness({ collections: [invalid] });
  control(view.render(), 'Share Old links').props.onClick();
  const result = html(view.render());
  assert.match(result, /role="alert"/);
  assert.equal(control(view.render(), 'Copy Markdown').props.disabled, true);
});

test('sharing copies real Markdown and reports clipboard rejection without a fake URL', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const copies: string[] = [];
  let denied = false;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    clipboard: { writeText: async (value: string) => {
      if (denied) throw new Error('Permission denied');
      copies.push(value);
    } },
  } });
  try {
    const view = harness();
    control(view.render(), 'Share Reading list').props.onClick();
    const before = html(view.render());
    assert.doesNotMatch(before, /https?:\/\/[^"< ]*\/collection[s]?\//);
    await control(view.render(), 'Copy Markdown').props.onClick();
    assert.ok(copies[0].includes('# Reading list'));
    assert.ok(copies[0].includes('https://paper.example/read'));
    assert.ok(copies[0].includes('Research section'));
    denied = true;
    await control(view.render(), 'Copy Markdown').props.onClick();
    assert.match(html(view.render()), /Could not copy/);
    assert.doesNotMatch(html(view.render()), /role="status"[^>]*>Markdown copied/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});

test('JSON sharing creates a real downloadable single-collection document and revokes its URL', async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const create = URL.createObjectURL;
  const revoke = URL.revokeObjectURL;
  let blob: Blob | undefined;
  let filename = '';
  const events: string[] = [];
  const anchor = {
    href: '', download: '', style: {}, remove: () => events.push('remove'),
    click() { filename = this.download; events.push('click'); },
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => anchor, body: { appendChild: () => events.push('append') },
  } });
  URL.createObjectURL = value => { blob = value as Blob; return 'blob:local-export'; };
  URL.revokeObjectURL = value => events.push(`revoke:${value}`);
  try {
    const view = harness();
    control(view.render(), 'Share Reading list').props.onClick();
    await control(view.render(), 'Download JSON').props.onClick();
    await flush();
    assert.ok(blob);
    const payload = await blob.text();
    assert.doesNotThrow(() => JSON.parse(payload));
    assert.ok(payload.includes('Reading list'));
    assert.ok(payload.includes('Research section'));
    assert.match(filename, /\.json$/);
    assert.deepEqual(events, ['append', 'click', 'remove', 'revoke:blob:local-export']);
  } finally {
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('Chinese actions are localized and empty collections expose a creation entry', () => {
  const view = harness({ language: 'zh-CN', collections: [] });
  const result = html(view.render());
  assert.match(result, /暂无网址单/);
  control(view.render(), '新建网址单').props.onClick();
  assert.ok(elements(view.render()).some(node => node.type === view.Editor));
});

test('explicit clear search restores the full list without native search decorations', () => {
  const view = harness();
  const search = elements(view.render()).find(node => node.type === 'input' && node.props.type === 'search')!;
  search.props.onChange({ target: { value: 'Research' } });
  assert.doesNotMatch(html(view.render()), /Other collection/);
  control(view.render(), 'Clear search').props.onClick();
  assert.match(html(view.render()), /Other collection/);
  assert.equal(elements(view.render()).find(node => node.type === 'input')!.props.value, '');
});

test('detail return action preserves the English and Chinese navigation labels', () => {
  const calls: unknown[] = [];
  for (const [language, label] of [['en-US', 'Back to My Collections'], ['zh-CN', '返回我的网址单']]) {
    const view = harness({ language, activeCollection: collection, onSelect: (value: unknown) => calls.push(value) });
    control(view.render(), label).props.onClick();
  }
  assert.deepEqual(calls, [null, null]);
});

test('storage failures expose localized recovery actions rather than internal error codes', async () => {
  const cases: [string, string, RegExp][] = [
    ['en', 'CONFLICT', /refresh|reload/i],
    ['zh', 'CONFLICT', /刷新/],
    ['en', 'QUOTA_EXCEEDED', /storage|space/i],
    ['zh', 'STORAGE_UNAVAILABLE', /存储|浏览器/],
  ];
  for (const [language, code, expected] of cases) {
    const view = harness({ language, onClone: async () => { throw new Error(code); } });
    await control(view.render(), language === 'en' ? 'Duplicate Reading list' : '复制 Reading list').props.onClick();
    const result = html(view.render());
    assert.match(result, expected);
    assert.ok(!result.includes(code), code);
  }
});

test('provenance displays source metadata as text without turning untrusted URLs into links', () => {
  const sourced: Collection = { ...collection, assetContent: {
    ...collection.assetContent!,
    provenance: [
      { sourceId: 'origin-1', title: 'Original resource', author: 'Original curator', url: 'javascript:alert(1)' },
      { sourceId: 'source-without-title', title: null, author: null, url: null },
    ],
  } };
  const view = harness({ activeCollection: sourced, collections: [sourced] });
  const result = html(view.render());
  for (const text of ['Sources', 'Original resource', 'Original curator', 'javascript:alert(1)', 'source-without-title']) {
    assert.ok(result.includes(text), text);
  }
  assert.ok(!elements(view.render()).some(node => node.type === 'a' && node.props.href === 'javascript:alert(1)'));
});

test('all queued mutations are suppressed when their own component instance unmounts', async () => {
  for (const kind of ['clone', 'delete', 'create', 'update', 'bookmark']) {
    let release!: () => void;
    let requests = 0;
    const calls: string[] = [];
    const gate: MutationGate = async (action, isCurrent) => {
      requests++;
      await new Promise<void>(resolve => { release = resolve; });
      if (!isCurrent()) throw new Error('CANCELLED');
      return action();
    };
    const view = harness({
      activeCollection: kind === 'bookmark' ? collection : null,
      onClone: () => calls.push('clone'), onDelete: () => calls.push('delete'),
      onCreate: () => calls.push('create'), onUpdate: () => calls.push('update'),
      onSaveBookmark: () => calls.push('bookmark'), onSelect: () => calls.push('navigate'),
    }, gate);
    let pending: Promise<unknown>;
    if (kind === 'create' || kind === 'update') {
      control(view.render(), kind === 'create' ? 'New collection' : 'Edit Reading list').props.onClick();
      const editor = elements(view.render()).find(node => node.type === view.Editor)!;
      pending = editor.props.onSave(collection);
    } else if (kind === 'delete') {
      control(view.render(), 'Delete Reading list').props.onClick();
      pending = control(view.render(), 'Confirm deletion').props.onClick();
    } else {
      pending = control(view.render(), kind === 'bookmark' ? 'Save Long paper' : 'Duplicate Reading list').props.onClick();
    }
    assert.equal(requests, 1, `${kind} must acquire the shared mutation lock`);
    const outcome = Promise.resolve(pending).catch(error => error);
    view.unmount();
    // A new component instance must not reactivate the old queue's mounted ref.
    const next = harness();
    next.render();
    release();
    await outcome;
    assert.deepEqual(calls, [], `${kind} callback must not execute after leaving`);
    assert.equal(view.lateWrites, 0, `${kind} must not update unmounted state`);
  }
});

test('late delete completion neither navigates nor updates an unmounted component', async () => {
  let finish!: () => void;
  const calls: unknown[] = [];
  const view = harness({
    activeCollection: collection,
    onDelete: () => new Promise<void>(resolve => { finish = resolve; }),
    onSelect: (value: unknown) => calls.push(value),
  });
  control(view.render(), 'Delete Reading list').props.onClick();
  const pending = control(view.render(), 'Confirm deletion').props.onClick();
  view.unmount();
  finish();
  await pending;
  assert.deepEqual(calls, []);
  assert.equal(view.lateWrites, 0);
});

test('clipboard completion after unmount does not write state or acquire a mutation lock', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let finish!: () => void;
  let locks = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    clipboard: { writeText: () => new Promise<void>(resolve => { finish = resolve; }) },
  } });
  try {
    const view = harness({}, async action => { locks++; return action(); });
    control(view.render(), 'Share Reading list').props.onClick();
    const pending = control(view.render(), 'Copy Markdown').props.onClick();
    view.unmount();
    finish();
    await pending;
    assert.equal(locks, 0);
    assert.equal(view.lateWrites, 0);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});

test('sharing warns about sensitive body text, URL parameters and item introductions in both languages', () => {
  for (const [language, action, reminder] of [
    ['zh-CN', '分享 Reading list', '分享前请检查正文、网址参数及条目介绍中是否含有敏感信息。'],
    ['en-US', 'Share Reading list', 'Review body text, URL parameters and item introductions for sensitive information before sharing.'],
  ]) {
    const view = harness({ language });
    control(view.render(), action).props.onClick();
    assert.ok(html(view.render()).includes(reminder));
  }
});

test('missing mutation locks explain secure context and Web Locks browser requirements', async () => {
  for (const language of ['en-US', 'zh-CN']) {
    const view = harness({ language }, async () => { throw new Error('LOCK_UNAVAILABLE'); });
    await control(view.render(), language === 'en-US' ? 'Duplicate Reading list' : '复制 Reading list').props.onClick();
    const result = html(view.render());
    assert.match(result, /Web Locks/);
    assert.match(result, language === 'en-US' ? /secure context/i : /安全上下文/);
    assert.doesNotMatch(result, /Close other tabs|关闭本应用的其他标签页|LOCK_UNAVAILABLE/);
  }
});
