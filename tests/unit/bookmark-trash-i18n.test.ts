import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import { createTranslator } from '../../src/i18n';
import type { BookmarkTrashViewProps } from '../../src/components/account/BookmarkTrashView';

function render(language: string | undefined, query = '', counts = [2, 1]) {
  const path = new URL('../../src/components/account/BookmarkTrashView.tsx', import.meta.url);
  const require = createRequire(path);
  const keys: string[] = [];
  let state = 0;
  const hooks = {
    ...React,
    useState: (initial: unknown) => [state++ === 0 ? query : initial, () => {}],
    useRef: (current: unknown) => ({ current }),
    useEffect: () => {},
  };
  const module = { exports: {} as { BookmarkTrashView: (props: BookmarkTrashViewProps) => React.ReactElement } };
  const code = transformSync(readFileSync(path, 'utf8'), { loader: 'tsx', format: 'cjs' }).code;
  new Function('require', 'module', 'exports', code)((id: string) => {
    if (id === 'react') return hooks;
    if (id === '../../i18n') return {
      ...require(id),
      createTranslator: (locale?: string) => {
        const translate = createTranslator(locale);
        return (key: Parameters<typeof translate>[0], ...args: unknown[]) => {
          keys.push(key);
          return (translate as (...values: unknown[]) => string)(key, ...args);
        };
      },
    };
    return require(id);
  }, module, module.exports);
  const folder = {
    id: 'root', name: '', bookmarkIds: [], pinnedToDesktop: false, order: 0, createdAt: 1, updatedAt: 1,
  };
  const bookmark = {
    id: 'bookmark', title: 'Example', url: 'https://example.com', domain: 'example.com', category: '',
    collectionIds: [], pinnedToDesktop: false, order: 0, createdAt: 1, updatedAt: 1,
  };
  const props: BookmarkTrashViewProps = {
    language, entries: [{ id: 'entry', deletedAt: 1793188800000, bookmark, folderIndex: 0 }],
    folders: [], onRestore: () => {}, onPurge: () => {},
    folderEntries: [{
      id: 'batch', rootId: 'root', deletedAt: 1793188800000,
      folders: Array.from({ length: counts[0] }, (_, index) => ({ folder: { ...folder, id: index ? `child-${index}` : 'root' }, index })),
      bookmarks: Array.from({ length: counts[1] }, (_, index) => ({ bookmark, index })),
    }],
  };
  const locales: unknown[] = [];
  const original = Date.prototype.toLocaleString;
  let html: string;
  try {
    Date.prototype.toLocaleString = function (...args: Parameters<typeof original>) {
      locales.push(args[0]);
      return original.apply(this, args);
    };
    html = renderToStaticMarkup(module.exports.BookmarkTrashView(props));
  } finally {
    Date.prototype.toLocaleString = original;
  }
  return { keys, html, locales };
}

for (const language of ['en-US', 'zh-CN', undefined]) {
  test(`trash ${language ?? 'default'} uses the central catalog and date locale`, () => {
    const { keys, html, locales } = render(language);
    for (const key of ['trashTitle', 'trashSearch', 'trashRoot', 'originalFolder', 'originalParent',
      'deletedAt', 'restoreBookmark', 'purgeBookmark', 'restoreFolder', 'purgeFolder',
      'unnamedFolder', 'trashFolderCounts', 'trashDateLocale']) {
      assert.ok(keys.includes(key), `${key} must be translated centrally`);
    }
    assert.deepEqual(locales, [language === 'en-US' ? 'en-US' : 'zh-CN',
      language === 'en-US' ? 'en-US' : 'zh-CN']);
    assert.match(html, language === 'en-US' ? /2 folders · 1 bookmark/ : /2 个目录 · 1 条收藏/);
  });
}

test('singular and zero folder counts and combined no-results use translated messages', () => {
  const singular = render('en-US', '', [1, 0]);
  assert.ok(singular.keys.includes('trashFolderCounts'));
  assert.match(singular.html, /1 folder · 0 bookmarks/);
  for (const language of ['en-US', 'zh-CN']) {
    const result = render(language, 'no-match');
    assert.ok(result.keys.includes('trashNoItems'));
    assert.match(result.html, language === 'en-US' ? /No matching items/ : /没有匹配的条目/);
  }
});

test('folder and bookmark count fragments preserve the original zh/en singular and plural text', () => {
  for (const language of ['en-US', 'zh-CN']) {
    const t = createTranslator(language);
    for (const [folders, bookmarks] of [[0, 0], [1, 1], [2, 2]]) {
      const counts = t('trashFolderCounts', {
        folders: t(folders === 1 ? 'countFolderOne' : 'countFolderMany', { count: folders }),
        bookmarks: t(bookmarks === 1 ? 'countBookmarkOne' : 'countBookmarkMany', { count: bookmarks }),
      });
      assert.equal(counts, language === 'en-US'
        ? `${folders} ${folders === 1 ? 'folder' : 'folders'} · ${bookmarks} ${bookmarks === 1 ? 'bookmark' : 'bookmarks'}`
        : `${folders} 个目录 · ${bookmarks} 条收藏`);
    }
  }
});
