import assert from 'node:assert/strict';
import test from 'node:test';
import { createTranslator, messages, resolveLocale, type MessageKey } from '../../src/i18n';
import { preferenceSaveError } from '../../src/services/preference-save-error';

test('translation dictionaries expose the same typed keys for Chinese and English', () => {
  const keys = Object.keys(messages.zh).sort();
  assert.deepEqual(Object.keys(messages.en).sort(), keys);
  assert.ok(keys.length > 20);
  for (const key of keys as MessageKey[]) {
    assert.notEqual(messages.zh[key], '');
    assert.notEqual(messages.en[key], '');
  }
});

test('translator selects locale and replaces named parameters', () => {
  const zh = createTranslator('zh');
  const en = createTranslator('en-US');
  assert.equal(zh('deleteBookmarks', { count: 2 }), '删除 2 条收藏？');
  assert.equal(en('deleteBookmarks', { count: 2 }), 'Delete 2 bookmarks?');
  assert.equal(en('alreadySavedAs', { title: 'Unsplash' }), 'Already saved as "Unsplash"');
  assert.equal(en('alreadySavedAs', { title: '{count} $& <img>' }), 'Already saved as "{count} $& <img>"');
  for (const language of ['en', 'en-US', 'EN-gb']) assert.equal(resolveLocale(language), 'en');
  for (const language of [undefined, '', 'zh', 'zh-CN', 'fr']) assert.equal(resolveLocale(language), 'zh');
});

test('each bilingual message has identical named parameters with no unresolved slots', () => {
  const slots = (value: string) => [...new Set([...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]))].sort();
  for (const key of Object.keys(messages.zh) as MessageKey[]) {
    assert.deepEqual(slots(messages.zh[key]), slots(messages.en[key]), key);
  }
});

function translationTypeContract() {
  const t = createTranslator('en');
  t('cancel');
  t('deleteBookmarks', { count: 2 });
  // @ts-expect-error Unknown keys must not silently leak into the UI.
  t('missingMessage');
  // @ts-expect-error Count is required for this template.
  t('deleteBookmarks');
  // @ts-expect-error A misspelled parameter must fail type checking.
  t('deleteBookmarks', { counts: 2 });
  // @ts-expect-error Static messages take no parameters.
  t('cancel', { count: 2 });
}

test('shared library save errors use the typed bilingual dictionary', () => {
  assert.equal(
    preferenceSaveError(new Error('COMMIT_UNCERTAIN'), 'zh', 'library'),
    '数据保存结果无法确认。请先刷新并检查收藏库，再决定后续操作；不要盲目重试或清空浏览器数据。',
  );
  assert.equal(
    preferenceSaveError(new Error('COMMIT_UNCERTAIN'), 'en-US', 'library'),
    'The data save result is uncertain. Refresh and check the library before making more changes. Do not retry blindly or clear browser data.',
  );
});
