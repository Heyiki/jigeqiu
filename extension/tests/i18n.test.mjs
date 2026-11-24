import assert from 'node:assert/strict';
import test from 'node:test';
import { getPrivacySections, PRIVACY_VERSION } from '../privacy/content.ts';
import { createTranslator } from '../../src/i18n/index.ts';

test('privacy translations cover all sections and retain privacy safeguards', () => {
  const en = getPrivacySections('en-US');
  assert.equal(en.length, 14);
  assert.equal(getPrivacySections('zh').length, en.length);
  const zh = getPrivacySections('zh');
  assert.match(zh.find(section => section.title === '浏览器书签授权').text, /读取和修改全部浏览器书签/);
  assert.match(en.find(section => section.title === 'Browser bookmark authorization').text, /read and change all browser bookmarks/);
  for (const [sections, title] of [[zh, '链接健康检查'], [en, 'Link health checks']]) {
    assert.match(sections.find(section => section.title === title).text, /HEAD.*GET/);
  }
  assert.match(zh.find(section => section.title === '告知记录与后续变更').text, /使用指南.*隐私说明/);
  assert.match(en.find(section => section.title === 'Acknowledgment and future changes').text, /Privacy notice.*User guide/);
  for (const section of en) {
    assert.ok(section.title.trim());
    assert.ok(section.text.trim());
    assert.doesNotMatch(section.title + section.text, /[\u3400-\u9fff]/);
  }
  assert.match(en.map(section => section.text).join(' '), /credentials|Limited Use|chrome.storage.local/);
  assert.equal(PRIVACY_VERSION, '2026-11-24.1', 'Expanded disclosures require an updated acknowledgment');
  assert.match(createTranslator('en')('extensionRemoteImageNotice'), /cookies/);
  assert.match(createTranslator('en')('extensionStorageError'), /Do not uninstall/);
});
