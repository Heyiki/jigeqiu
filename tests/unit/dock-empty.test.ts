import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BottomDock } from '../../src/components/dock/BottomDock';
import type { Bookmark } from '../../src/types';
import { MemoryStorage } from '../support/memory-storage';

test('an explicitly empty Dock never falls back to desktop-pinned bookmarks', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
  const bookmark: Bookmark = {
    id: 'desktop-only', title: 'DesktopOnlyProbe', url: 'https://example.com/',
    domain: 'example.com', category: '', order: 0, collectionIds: [],
    createdAt: 0, updatedAt: 0, pinnedToDesktop: true,
  };
  const html = renderToStaticMarkup(React.createElement(BottomDock, {
    bookmarks: [bookmark], dockBookmarkIds: [], showTools: false,
    onOpenBookmark() {}, onOpenTool() {}, onQuickAdd() {},
  }));
  assert.doesNotMatch(html, /DesktopOnlyProbe/);
});
