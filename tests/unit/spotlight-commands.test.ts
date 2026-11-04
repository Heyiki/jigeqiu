import assert from 'node:assert/strict';
import test from 'node:test';
import { isDesktopSearchKey, matchSpotlightCommands } from '../../src/components/desktop/spotlight-commands';
import type { SearchEngine } from '../../src/types';

const engines: SearchEngine[] = [
  { id: 'one', name: 'One', keyword: 'search', urlTemplate: 'https://one.test/?q={query}', isEnabled: true },
  { id: 'two', name: 'Two', keyword: 'search', urlTemplate: 'https://two.test/?q={query}', isEnabled: true },
  { id: 'off', name: 'Off', keyword: 'setting', urlTemplate: 'https://off.test/?q={query}', isEnabled: false },
  { id: 'long', name: 'Long', keyword: 'searching', urlTemplate: 'https://long.test/?q={query}', isEnabled: true },
];

test('slash lists system commands and all enabled engines without deduplication', () => {
  const matches = matchSpotlightCommands('/', engines);
  assert.equal(matches.filter(item => item.kind === 'system').length, 10);
  assert.equal(matches.filter(item => item.kind === 'engine').length, 3);
});
test('exact system command precedes colliding engines and partial matches', () => {
  const matches = matchSpotlightCommands('/SEARCH', engines);
  assert.deepEqual(matches.map(item => item.kind === 'system' ? item.command.id : item.engine.id),
    ['search', 'one', 'two', 'long']);
});
test('arguments only match exact engine keywords and preserve query whitespace', () => {
  const matches = matchSpotlightCommands('/search  React &  Tailwind ', engines);
  assert.deepEqual(matches.map(item => item.kind === 'engine' && [item.engine.id, item.query]),
    [['one', 'React &  Tailwind'], ['two', 'React &  Tailwind']]);
  assert.deepEqual(matchSpotlightCommands('/s query', engines), []);
});
test('partial system command completion and unknown commands do not execute arbitrary actions', () => {
  assert.deepEqual(matchSpotlightCommands('/s', []).map(item => item.kind === 'system' && item.command.id), ['setting', 'search', 'start']);
  assert.deepEqual(matchSpotlightCommands('/add unexpected', engines), []);
  assert.deepEqual(matchSpotlightCommands('search', engines), []);
  assert.deepEqual(matchSpotlightCommands('/unknown', engines), []);
});
test('launcher, trash, appearance and explicit mode commands match case-insensitive prefixes', () => {
  for (const [input, expected] of [
    ['/sta', 'start'], ['/TRASH', 'trash'], ['/the', 'theme'], ['/DARK', 'dark'], ['/li', 'light'], ['/HE', 'help'],
  ]) {
    assert.deepEqual(matchSpotlightCommands(input, []).map(item => item.kind === 'system' && item.command.id), [expected]);
    assert.deepEqual(matchSpotlightCommands(`${input} unexpected`, []), []);
  }
});
test('help precedes a colliding engine, while help arguments only search the engine', () => {
  const engines: SearchEngine[] = [
    { id: 'help-search', name: 'Help Search', keyword: 'help', urlTemplate: 'https://example.test/?q={query}', isEnabled: true },
  ];
  assert.deepEqual(matchSpotlightCommands('/HELP', engines).map(item => item.kind), ['system', 'engine']);
  assert.deepEqual(matchSpotlightCommands('/help query', engines).map(item => item.kind), ['engine']);
  assert.deepEqual(matchSpotlightCommands('/help unexpected', []), []);
});
test('new system commands preserve colliding enabled search engines', () => {
  const engines: SearchEngine[] = [
    { id: 'dark-search', name: 'Dark Search', keyword: 'dark', urlTemplate: 'https://example.test/?q={query}', isEnabled: true },
  ];
  assert.deepEqual(matchSpotlightCommands('/dark', engines).map(item => item.kind), ['system', 'engine']);
  assert.deepEqual(matchSpotlightCommands('/dark query', engines).map(item => item.kind), ['engine']);
});
test('desktop slash invocation rejects composition, repeats and modifier combinations', () => {
  const base = { key: '/', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, keyCode: 191 };
  assert.equal(isDesktopSearchKey(base), true);
  assert.equal(isDesktopSearchKey({ ...base, key: '、' }), true);
  for (const field of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'repeat', 'isComposing']) {
    assert.equal(isDesktopSearchKey({ ...base, [field]: true }), false, field);
  }
  assert.equal(isDesktopSearchKey({ ...base, keyCode: 229 }), false);
  assert.equal(isDesktopSearchKey({ ...base, key: '?' }), false);
});
