import assert from 'node:assert/strict';
import test from 'node:test';
import { hashForRoute, parseHashRoute, routeTitle } from '../../src/services/hash-route';

test('every current destination round-trips without introducing removed features', () => {
  for (const section of ['bookmarks', 'engines', 'appearance', 'import-export', 'trash'] as const) {
    const route = { page: 'management', section } as const;
    assert.deepEqual(parseHashRoute(hashForRoute(route)), route);
  }
  assert.deepEqual(parseHashRoute('#/'), { page: 'desktop' });
  assert.deepEqual(parseHashRoute('#/settings/appearance'), { page: 'management', section: 'appearance' });
  assert.deepEqual(parseHashRoute('#/library'), { page: 'management', section: 'bookmarks' });
});

test('empty, unknown and malformed paths safely resolve to desktop', () => {
  for (const hash of ['', '#', '#/collections', '#/settings/missing', '#/%ZZ', '#/library/extra']) {
    assert.deepEqual(parseHashRoute(hash), { page: 'desktop' });
  }
});

test('titles identify the current page and follow language changes', () => {
  assert.equal(routeTitle({ page: 'desktop' }, 'zh'), '桌面 · 记个球');
  assert.equal(routeTitle({ page: 'management', section: 'appearance' }, 'zh'), '外观设置 · 记个球');
  assert.equal(routeTitle({ page: 'management', section: 'engines' }, 'en'), 'Search Engines · JIGEQIU');
});

test('launchpad has a stable direct route and localized title', () => {
  assert.deepEqual(parseHashRoute('#/start'), { page: 'launchpad' });
  assert.equal(hashForRoute(parseHashRoute('#/start')), '#/start');
  assert.equal(routeTitle(parseHashRoute('#/start'), 'zh'), '启动台 · 记个球');
  assert.equal(routeTitle(parseHashRoute('#/start'), 'en-US'), 'Launchpad · JIGEQIU');
});
