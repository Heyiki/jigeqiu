import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { buildBookmarkSearchIndex, searchBookmarkIds } from '../../src/services/bookmark-search';

test('shared search covers all fields without filtering URLs, sorting or indexing legacy tags', () => {
  const items = [
    { id: 'fuel', title: '小熊油耗', url: 'https://example.test/fuel', domain: 'example.test', notes: '私人备注', keywords: ['汽车'], tags: ['秘密标签'] },
    { id: 'unsafe', title: '小熊油耗', url: 'javascript:alert(1)', domain: '' },
  ];
  const index = buildBookmarkSearchIndex(items, () => '工作资料');
  for (const query of ['小熊', 'xxyh', 'ＸＸＹＨ', ' XXYH ', 'xiaoxiong', 'xxy', 'xx 油耗', 'gzzl']) {
    assert.deepEqual([...searchBookmarkIds(index, query)], ['fuel', 'unsafe'], query);
  }
  for (const query of ['xxyh qiche', 'srbz', '/fuel', 'EXAMPLE.TEST']) {
    assert.deepEqual([...searchBookmarkIds(index, query)], ['fuel'], query);
  }
  for (const query of ['xxyg', 'xxyh absent', '秘密标签', 'mmbq']) {
    assert.deepEqual([...searchBookmarkIds(index, query)], [], query);
  }
  assert.deepEqual([...searchBookmarkIds(index, ' \t\n ')], ['fuel', 'unsafe']);
});

test('query uses immutable indexed text and rebuilding picks up edited titles and paths', () => {
  const item = { id: 'one', title: '小熊油耗', url: 'https://example.test/', domain: 'example.test' };
  const before = buildBookmarkSearchIndex([item], () => '工作');
  item.title = '中文工具';
  assert.deepEqual([...searchBookmarkIds(before, 'xxyh')], ['one']);
  assert.deepEqual([...searchBookmarkIds(before, 'zwgj')], []);
  const after = buildBookmarkSearchIndex([item], () => '生活');
  assert.deepEqual([...searchBookmarkIds(after, 'zwgj sh')], ['one']);
  assert.deepEqual([...searchBookmarkIds(after, 'xxyh')], []);
  assert.deepEqual([...searchBookmarkIds(after, 'gongzuo')], []);
  assert.equal(item.title, '中文工具');
});

test('rebuilding the same bookmark snapshot reuses normalized fields across search consumers', () => {
  const item = { id: 'reuse', title: '缓存复用中文', url: 'https://reuse.test/', domain: 'reuse.test', notes: '私人备注', keywords: ['工作'] };
  const normalize = mock.method(String.prototype, 'normalize');
  try {
    const first = buildBookmarkSearchIndex([item], () => '工作资料');
    const initialCalls = normalize.mock.callCount();
    assert.ok(initialCalls > 0);
    const second = buildBookmarkSearchIndex([item], () => '工作资料');
    assert.equal(normalize.mock.callCount(), initialCalls, 'A second consumer does not repeat normalization or pinyin indexing');
    assert.deepEqual(second, first);
    assert.notEqual(second.get('reuse'), first.get('reuse'), 'Consumers own their indexed fields');
  } finally { normalize.mock.restore(); }
});

test('cached search fields cannot be corrupted by callers and detect in-place keyword edits', () => {
  const item = { id: 'mutable', title: '中文工具', url: 'https://mutable.test/', domain: 'mutable.test', keywords: ['工作'] };
  const before = buildBookmarkSearchIndex([item], () => '资料');
  before.get(item.id)!.fields.title.push('corrupted-title');
  before.get(item.id)!.searchFields.push('corrupted-result');
  const after = buildBookmarkSearchIndex([item], () => '资料');
  assert.deepEqual([...searchBookmarkIds(after, 'corrupted')], []);
  item.keywords[0] = '生活';
  const edited = buildBookmarkSearchIndex([item], () => '资料');
  assert.deepEqual([...searchBookmarkIds(edited, 'shenghuo')], [item.id]);
  assert.deepEqual([...searchBookmarkIds(edited, 'gongzuo')], []);
});
