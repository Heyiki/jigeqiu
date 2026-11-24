import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BookmarkSourceSettings, BookmarkSourceNotice } from '../../src/components/common/BookmarkSourceSettings';
import { configureBookmarkSourcePlatform } from '../../src/services/bookmark-source-platform';

test('the website has no browser source controls', () => {
  configureBookmarkSourcePlatform(undefined);
  assert.equal(renderToStaticMarkup(React.createElement(BookmarkSourceSettings)), '');
  assert.equal(renderToStaticMarkup(React.createElement(BookmarkSourceNotice)), '');
});

test('the extension names the current source and explains that switching preserves both libraries', () => {
  configureBookmarkSourcePlatform({ source: () => 'browser', problem: () => undefined,
    subscribe: () => () => {}, switchSource: async () => {} });
  try {
    const html = renderToStaticMarkup(React.createElement(BookmarkSourceSettings, { language: 'en' }));
    assert.ok(html.includes('Browser bookmarks'));
    assert.ok(html.includes('aria-pressed="true"'));
    assert.ok(html.includes('merge'));
    assert.ok(renderToStaticMarkup(React.createElement(BookmarkSourceNotice)).includes('浏览器书签'));
  } finally { configureBookmarkSourcePlatform(undefined); }
});
