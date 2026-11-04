import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { transformSync } from 'esbuild';

function nodes(tree: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement<{ children?: React.ReactNode }>(tree)) return [];
  return [tree, ...nodes(tree.props.children)];
}
function text(tree: React.ReactNode): string {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join('');
  return React.isValidElement<{ children?: React.ReactNode }>(tree) ? text(tree.props.children) : '';
}
function harness(name: 'BookmarkDialog' | 'BookmarkKeywordsInput' | 'FolderTreeSelect', overrides: Record<string, unknown> = {}) {
  const path = new URL(`../../src/components/common/${name}.tsx`, import.meta.url);
  const require = createRequire(path);
  const state: unknown[] = [];
  let cursor = 0;
  const hooks = {
    ...React,
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value: any) => {
        state[index] = typeof value === 'function' ? value(state[index]) : value;
      }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in state)) state[index] = { current: initial };
      return state[index];
    },
    useId: () => 'language-test',
    useEffect() {},
    useMemo: (compute: () => unknown) => compute(),
  };
  const source = readFileSync(path, 'utf8') + (name === 'BookmarkDialog' ? '\nexport { BookmarkDialogSession };' : '');
  const module = { exports: {} as Record<string, (props: object) => React.ReactElement<any>> };
  new Function('require', 'module', 'exports',
    transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code)(
    (id: string) => id === 'react' ? hooks
      : id === '../../services/collection-mutation' ? {
        withCollectionMutation: async (action: () => unknown) => action(),
      } : require(id),
    module, module.exports,
  );
  const changes: unknown[] = [];
  const props = {
    isOpen: true, folders: [], existingBookmarks: [], initialUrl: 'https://example.com',
    value: name === 'BookmarkKeywordsInput' ? ['private'] : undefined,
    language: 'en-US', onSave() {}, onClose() {}, onChange: (value: unknown) => changes.push(value),
    ...overrides,
  };
  const render = () => {
    cursor = 0;
    return module.exports[name === 'BookmarkDialog' ? 'BookmarkDialogSession' : name](props);
  };
  const find = (predicate: (node: React.ReactElement<any>) => boolean) => {
    const node = nodes(render()).find(predicate);
    assert.ok(node, 'Missing control');
    return node;
  };
  const button = (label: string) => find(node => node.type === 'button'
    && (node.props['aria-label'] === label || text(node) === label));
  const submit = () => find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  return { props, changes, render, find, button, submit };
}

test('keyword controls resolve en-US and switch languages without losing the draft or keyword values', () => {
  const view = harness('BookmarkKeywordsInput');
  assert.match(text(view.render()), /Search keywords \(optional\)/);
  assert.equal(view.button('Remove private').props.title, 'Remove private');
  view.find(node => node.type === 'input').props.onChange({ target: { value: 'Draft' } });
  view.props.language = 'zh';
  assert.match(text(view.render()), /搜索关键词（可选）/);
  assert.equal(view.find(node => node.type === 'input').props.value, 'Draft');
  view.button('移除关键词 private').props.onClick();
  assert.deepEqual(view.changes, [[]]);
});

test('folder selector resolves en-US for nested paths, expansion and search without losing selection', () => {
  const folder = (id: string, name: string, parentId?: string) => ({
    id, name, parentId, bookmarkIds: [], order: 0, pinnedToDesktop: false, createdAt: 1, updatedAt: 1,
  });
  const view = harness('FolderTreeSelect', {
    folders: [folder('parent', 'Parent'), folder('child', 'Child', 'parent')], value: 'child',
  });
  assert.match(text(view.render()), /Bookmark location.*Library root \/ Parent \/ Child/);
  view.find(node => node.props['aria-haspopup'] === 'tree').props.onClick();
  assert.equal(view.button('Collapse: Parent').props.title, 'Collapse');
  view.find(node => node.props.type === 'search').props.onChange({ target: { value: 'missing' } });
  assert.match(text(view.render()), /No matching folders/);
  view.props.language = 'zh';
  assert.match(text(view.render()), /收藏位置.*收藏库根目录 \/ Parent \/ Child/);
  assert.match(text(view.render()), /没有匹配的文件夹/);
  assert.equal(view.find(node => node.props.type === 'search').props.value, 'missing');
  assert.equal(view.changes.length, 0);
});

test('folder creation failures follow locale changes and never expose raw storage errors', () => {
  let failure: unknown = {};
  const view = harness('FolderTreeSelect', { onCreateFolder: () => { throw failure; } });
  view.find(node => node.props['aria-haspopup'] === 'tree').props.onClick();
  view.button('New folder').props.onClick();
  view.find(node => node.props['aria-label'] === 'New folder name').props.onChange({ target: { value: 'Draft folder' } });
  view.button('Create folder').props.onClick();
  assert.equal(text(view.find(node => node.props.role === 'alert')), 'Could not create folder');
  view.props.language = 'zh';
  assert.equal(text(view.find(node => node.props.role === 'alert')), '创建文件夹失败');
  assert.equal(view.find(node => node.props['aria-label'] === '新文件夹名称').props.value, 'Draft folder');
  failure = new Error('External validation detail');
  view.button('创建文件夹').props.onClick();
  assert.equal(text(view.find(node => node.props.role === 'alert')), '收藏库数据保存失败，变更未应用。请保留输入，检查浏览器存储后重试。');
  failure = new DOMException('Full', 'QuotaExceededError');
  view.button('创建文件夹').props.onClick();
  view.props.language = 'en-US';
  assert.match(text(view.find(node => node.props.role === 'alert')), /Browser storage is full/);
  view.props.language = 'zh';
  assert.match(text(view.find(node => node.props.role === 'alert')), /浏览器存储空间不足/);
  assert.equal(view.changes.length, 0);
});

test('bookmark validation follows a language switch while retaining fields', async () => {
  let saves = 0;
  const view = harness('BookmarkDialog', { onSave: () => { saves++; } });
  view.find(node => node.props.id === 'bookmark-title').props.onChange({ target: { value: ' ' } });
  await view.submit();
  assert.equal(text(view.find(node => node.props.role === 'alert')), 'Enter a website name');
  view.props.language = 'zh';
  assert.equal(text(view.find(node => node.props.role === 'alert')), '请输入网站名称');
  assert.equal(view.find(node => node.props.id === 'bookmark-title').props.value, ' ');
  assert.equal(view.render().props.title, '添加收藏');
  assert.equal(saves, 0);
});

test('bookmark interpolated duplicate and desktop-folder labels preserve raw user text when switching languages', () => {
  const title = 'My "site" {name}';
  const folderName = 'Work {title}';
  const existing = {
    id: 'existing', title, url: 'https://example.com', domain: 'example.com', category: '',
    collectionIds: [], pinnedToDesktop: false, order: 0, createdAt: 1, updatedAt: 1,
  };
  const view = harness('BookmarkDialog', { existingBookmarks: [existing], desktopFolderName: folderName });
  assert.ok(text(view.render()).includes(`Already saved as "${title}"`));
  assert.ok(text(view.render()).includes(`Also pin to desktop folder "${folderName}"`));
  view.props.language = 'zh';
  assert.ok(text(view.render()).includes(`此网址已收藏为「${title}」`));
  assert.ok(text(view.render()).includes(`同时固定到桌面文件夹「${folderName}」`));
});

test('bookmark dialog passes its current language to the site icon picker', () => {
  const view = harness('BookmarkDialog');
  const picker = () => view.find(node => typeof node.type === 'function' && node.type.name === 'SiteIconPicker');
  assert.equal(picker().props.language, 'en-US');
  view.props.language = 'zh';
  assert.equal(picker().props.language, 'zh');
});

for (const [cause, chinese, english] of [
  [new Error('DUPLICATE'), '收藏库中已有此网址，请打开或编辑已有收藏。',
    'This URL is already in your library. Open or edit the existing bookmark.'],
  [new Error('INVALID_ICON'), '图标链接无效，请使用不含账号密码的 HTTP(S) 图片地址。',
    'The icon URL is invalid. Use an HTTP(S) image URL without a username or password.'],
  [new Error('UNKNOWN'), '保存失败，请检查网址与文件夹后重试。输入已保留。',
    'Saving failed. All input is kept. Please check the address and folder, then try again.'],
  [{ code: 'DUPLICATE' }, '保存失败，请检查网址与文件夹后重试。输入已保留。',
    'Saving failed. All input is kept. Please check the address and folder, then try again.'],
] as const) {
  test(`bookmark fallback retains original bilingual copy for ${cause instanceof Error ? cause.message : 'plain code object'}`, async () => {
    const view = harness('BookmarkDialog', { onSave: () => { throw cause; } });
    await view.submit();
    assert.equal(text(view.find(node => node.props.role === 'alert')), english);
    view.props.language = 'zh';
    assert.equal(text(view.find(node => node.props.role === 'alert')), chinese);
  });
}

for (const [code, english, chinese] of [
  ['COMMIT_UNCERTAIN', /uncertain.*Refresh.*library/, /无法确认.*刷新.*收藏库/],
  ['CONFLICT', /another tab.*Download/, /其他标签页.*下载/],
  ['LOCK_UNAVAILABLE', /HTTPS.*Web Locks/, /HTTPS.*Web Locks/],
] as const) {
  test(`bookmark ${code} feedback changes locale without closing or rewriting the draft`, async () => {
    let writes = 0, closes = 0;
    const view = harness('BookmarkDialog', {
      onSave: () => { writes++; throw new Error(code); }, onClose: () => { closes++; },
    });
    view.find(node => node.props.id === 'bookmark-title').props.onChange({ target: { value: ' Draft title ' } });
    await view.submit();
    assert.match(text(view.find(node => node.props.role === 'alert')), english);
    view.props.language = 'zh';
    const message = text(view.find(node => node.props.role === 'alert'));
    assert.match(message, chinese);
    if (code === 'COMMIT_UNCERTAIN') assert.doesNotMatch(message, /未保存|未应用/);
    if (code === 'CONFLICT') assert.ok(view.button('下载当前草稿'));
    assert.equal(view.find(node => node.props.id === 'bookmark-title').props.value, ' Draft title ');
    assert.equal(writes, 1);
    assert.equal(closes, 0);
  });
}
