import assert from 'node:assert/strict';
import test from 'node:test';
import { SEARCH_ENGINE_PRESETS } from '../../src/data/search-engine-presets';
import { searchEnginePresetStatus } from '../../src/services/search-engine-presets';
import { StorageManager } from '../../src/services/storage';
import { DEFAULT_SEARCH_ENGINES } from '../../src/data/defaultData';
import { messages } from '../../src/i18n';
import { MemoryStorage } from '../support/memory-storage';

const key = 'jipage_search_engines_v1';
function setup() {
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  return { memory, manager: new StorageManager() };
}
const preset = (id: string) => SEARCH_ENGINE_PRESETS.find(item => item.id === id)!;

test('catalog contains exactly the 31 approved sites, unique IDs, keywords and safe query templates', () => {
  assert.equal(SEARCH_ENGINE_PRESETS.length, 31);
  assert.equal(new Set(SEARCH_ENGINE_PRESETS.map(item => item.id)).size, 31);
  assert.equal(new Set(SEARCH_ENGINE_PRESETS.map(item => item.keyword)).size, 31);
  assert.deepEqual(SEARCH_ENGINE_PRESETS.map(item => item.id).sort(), [
    'baidu', 'bing', 'google', 'duckduckgo', 'sogou', '360', 'yahoo', 'shenma',
    'zhihu', 'wiki', 'baike', 'douban', 'wechat', 'scholar', 'bilibili', 'youtube',
    'douyin', 'xiaohongshu', 'weibo', 'taobao', 'jd', 'tmall', 'amazon', 'github',
    'stackoverflow', 'mdn', 'juejin', 'csdn', 'toutiao', 'dongchedi', 'autohome',
  ].map(id => `se-${id}`).sort());
  for (const item of SEARCH_ENGINE_PRESETS) {
    assert.equal(item.urlTemplate.split('{query}').length, 2);
    const url = new URL(item.urlTemplate.replace('{query}', encodeURIComponent('中文 & a/b?')));
    assert.equal(url.protocol, 'https:');
    assert.equal(url.username, '');
    assert.equal(url.password, '');
    assert.ok(messages.zh[item.nameKey]);
    assert.ok(messages.en[item.nameKey]);
  }
  for (const id of ['se-toutiao', 'se-yahoo', 'se-dongchedi', 'se-autohome', 'se-shenma']) {
    assert.ok(preset(id));
  }
});

test('existing engines are recognized by identity or equivalent URL, not keyword alone', () => {
  assert.equal(searchEnginePresetStatus(preset('se-google'), DEFAULT_SEARCH_ENGINES), 'added');
  const renamed = { ...DEFAULT_SEARCH_ENGINES[0], id: 'custom-google', keyword: 'mine', isEnabled: false };
  assert.equal(searchEnginePresetStatus(preset('se-google'), [renamed]), 'added');
  const collision = { ...renamed, urlTemplate: 'https://example.com/?q={query}', keyword: ' TT ' };
  assert.equal(searchEnginePresetStatus(preset('se-toutiao'), [collision]), 'conflict');
  assert.equal(searchEnginePresetStatus(preset('se-yahoo'), [collision]), 'available');
});

test('batch adds selected engines once, preserving defaults, disabled/custom engines and unrelated bytes', () => {
  const { memory, manager } = setup();
  manager.saveSearchEngines([...DEFAULT_SEARCH_ENGINES, {
    id: 'custom', name: 'Keep', keyword: 'mine', urlTemplate: 'https://example.com/?q={query}',
    icon: 'Search', isDefault: false, isEnabled: false, isCustom: true,
  }]);
  memory.setItem('jipage_settings_v1', '{"defaultSearchEngineId":"se-baidu"}');
  memory.setItem('jipage_library_v2', '{"doNotTouch":true}');
  const before = manager.getSearchEngines();
  let writes = 0;
  const set = memory.setItem.bind(memory);
  memory.setItem = (name, value) => { writes++; set(name, value); };
  const result = manager.addSearchEnginePresets(['se-toutiao', 'se-yahoo', 'se-toutiao', 'se-google'], 'en');
  assert.equal(writes, 1);
  assert.equal(result.addedCount, 2);
  assert.deepEqual(result.engines.slice(0, before.length), before);
  assert.equal(result.engines.find(item => item.id === 'se-toutiao')?.name, 'Toutiao');
  assert.ok(result.engines.slice(before.length).every(item => item.isEnabled && !item.isDefault));
  assert.equal(memory.getItem('jipage_settings_v1'), '{"defaultSearchEngineId":"se-baidu"}');
  assert.equal(memory.getItem('jipage_library_v2'), '{"doNotTouch":true}');
  assert.deepEqual(new StorageManager().getSearchEngines(), result.engines);
  assert.equal(manager.addSearchEnginePresets(['se-toutiao', 'se-yahoo']).addedCount, 0);
  assert.equal(writes, 1);
});

test('batch rechecks current storage and skips newly added or conflicting choices without overwrites', () => {
  const { manager } = setup();
  manager.createSearchEngine('My headline search', 'tt', 'https://example.com/?q={query}');
  const result = manager.addSearchEnginePresets(['se-toutiao', 'se-yahoo']);
  assert.equal(result.addedCount, 1);
  assert.ok(!result.engines.some(item => item.id === 'se-toutiao'));
  assert.ok(result.engines.some(item => item.name === 'My headline search'));
  assert.throws(() => manager.addSearchEnginePresets(['unknown']), /INVALID_PRESET/);
});

test('quota and denied writes leave the whole batch unsaved and defaults unchanged', () => {
  for (const name of ['QuotaExceededError', 'SecurityError']) {
    const { memory, manager } = setup();
    const defaults = JSON.stringify(DEFAULT_SEARCH_ENGINES);
    const catalog = JSON.stringify(SEARCH_ENGINE_PRESETS);
    memory.setItem = () => { throw new DOMException('Denied', name); };
    assert.throws(() => manager.addSearchEnginePresets(['se-toutiao', 'se-yahoo']),
      (error: unknown) => error instanceof DOMException && error.name === name);
    assert.equal(memory.getItem(key), null);
    assert.equal(JSON.stringify(DEFAULT_SEARCH_ENGINES), defaults);
    assert.equal(JSON.stringify(SEARCH_ENGINE_PRESETS), catalog);
  }
});

test('corrupt or unknown engine records are never replaced by preset defaults', () => {
  for (const raw of ['broken', '', 'null', '{}', '[{}]', '{"version":2,"engines":[]}']) {
    const { memory, manager } = setup();
    memory.setItem(key, raw);
    assert.throws(() => manager.addSearchEnginePresets(['se-toutiao']), /CORRUPT_DATA/);
    assert.equal(memory.getItem(key), raw);
  }
});

test('denied reads and unverifiable writes are surfaced, not reported as success', () => {
  const { memory, manager } = setup();
  memory.failReads = true;
  assert.throws(() => manager.addSearchEnginePresets(['se-toutiao']),
    (error: unknown) => error instanceof DOMException && error.name === 'SecurityError');
  memory.failReads = false;
  const set = memory.setItem.bind(memory);
  memory.setItem = (name, value) => { set(name, `${value} `); };
  assert.throws(() => manager.addSearchEnginePresets(['se-toutiao']), /COMMIT_UNCERTAIN/);
});

test('an intentionally empty engine list stays empty until the user adds selected candidates', () => {
  const { manager } = setup();
  manager.saveSearchEngines([]);
  assert.deepEqual(manager.addSearchEnginePresets([]), { engines: [], addedCount: 0 });
  const result = manager.addSearchEnginePresets(['se-shenma'], 'zh');
  assert.equal(result.engines.length, 1);
  assert.equal(result.engines[0].name, '神马搜索');
  assert.equal(result.engines[0].isDefault, false);
});

test('a concurrent change discovered before writing is rejected without overwriting it', () => {
  const { memory, manager } = setup();
  const get = memory.getItem.bind(memory);
  let reads = 0;
  memory.getItem = name => {
    if (name === key && ++reads === 2) memory.setItem(key, '[]');
    return get(name);
  };
  assert.throws(() => manager.addSearchEnginePresets(['se-toutiao']), /CONFLICT/);
  assert.equal(get(key), '[]');
});

test('query parameter order and www aliases do not create duplicate presets', () => {
  const existing = {
    ...DEFAULT_SEARCH_ENGINES[0], id: 'custom-zhihu', keyword: 'custom',
    urlTemplate: 'https://zhihu.com/search?q={query}&type=content',
  };
  assert.equal(searchEnginePresetStatus(preset('se-zhihu'), [existing]), 'added');
});

test('engine ordering persists all engines while preserving settings, fields and disabled states', () => {
  const { memory, manager } = setup();
  manager.saveSearchEngines(DEFAULT_SEARCH_ENGINES.map((engine, index) => ({ ...engine, isEnabled: index !== 1 })));
  memory.setItem('jipage_settings_v1', '{"defaultSearchEngineId":"se-google"}');
  const before = manager.getSearchEngines();
  const ids = before.map(engine => engine.id);
  const reordered = manager.reorderSearchEngines([...ids].reverse(), ids);
  assert.deepEqual(reordered, [...before].reverse());
  assert.deepEqual(new StorageManager().getSearchEngines(), reordered);
  assert.equal(memory.getItem('jipage_settings_v1'), '{"defaultSearchEngineId":"se-google"}');
});

test('ordering rejects stale membership/order, duplicate or unknown IDs and corrupt records without writing', () => {
  const { memory, manager } = setup();
  const ids = manager.getSearchEngines().map(engine => engine.id);
  assert.throws(() => manager.reorderSearchEngines([...ids, ids[0]], ids), /INVALID_ORDER/);
  assert.throws(() => manager.reorderSearchEngines(['unknown', ...ids.slice(1)], ids), /INVALID_ORDER/);
  assert.throws(() => manager.reorderSearchEngines(ids, [...ids].reverse()), /CONFLICT/);
  manager.createSearchEngine('New', 'new', 'https://new.example/?q={query}');
  const before = memory.getItem(key);
  assert.throws(() => manager.reorderSearchEngines([...ids].reverse(), ids), /CONFLICT/);
  assert.equal(memory.getItem(key), before);
  memory.setItem(key, '{}');
  assert.throws(() => manager.reorderSearchEngines(ids, ids), /CORRUPT_DATA/);
  assert.equal(memory.getItem(key), '{}');
});

test('ordering surfaces denied writes and uncertain results, and does not write no-op moves', () => {
  const { memory, manager } = setup();
  const ids = manager.getSearchEngines().map(engine => engine.id);
  memory.failWrites = true;
  assert.deepEqual(manager.reorderSearchEngines(ids, ids), manager.getSearchEngines());
  assert.throws(() => manager.reorderSearchEngines([...ids].reverse(), ids));
  memory.failWrites = false;
  const set = memory.setItem.bind(memory);
  memory.setItem = (name, value) => set(name, `${value} `);
  assert.throws(() => manager.reorderSearchEngines([...ids].reverse(), ids), /COMMIT_UNCERTAIN/);
});

test('ordering rereads latest edited fields even when the displayed order is unchanged', () => {
  const { manager } = setup();
  const ids = manager.getSearchEngines().map(engine => engine.id);
  manager.updateSearchEngine(ids[0], {
    name: 'Edited in another tab', urlTemplate: 'https://new.example/?q={query}', isEnabled: false, isCustom: true,
  });
  const latest = manager.getSearchEngines()[0];
  const ordered = manager.reorderSearchEngines([...ids].reverse(), ids);
  assert.deepEqual(ordered.at(-1), latest);
});
