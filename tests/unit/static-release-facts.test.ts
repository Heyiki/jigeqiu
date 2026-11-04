import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { createTranslator } from '../../src/i18n';

test('open-source metadata does not advertise collections or a required server-side AI capability', () => {
  const metadata = JSON.parse(readFileSync(new URL('../../metadata.json', import.meta.url), 'utf8'));
  assert.equal(metadata.name, '记个球 - JIGEQIU');
  assert.doesNotMatch(metadata.description, /网址单/);
  assert.deepEqual(metadata.majorCapabilities, []);
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /网址单/);
  assert.match(html, /数据保存在当前浏览器/);
  assert.match(html, /<title>记个球 - JIGEQIU<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/jigeqiu\.com\/"\s*\/>/);
  assert.match(html, /<meta property="og:url" content="https:\/\/jigeqiu\.com\/"\s*\/>/);
  assert.doesNotMatch(html, /集页|JIPAGE/);
});

test('brand glyph, wordmark and accessible home label use the new identity in both languages', () => {
  for (const language of ['zh', 'en']) {
    const t = createTranslator(language);
    assert.equal(t('navigationBrandGlyph'), '记');
    assert.equal(t('navigationBrandName'), '记个球');
    assert.equal(t('navigationBrandWordmark'), 'JIGEQIU');
    assert.equal(t('navigationHomeLabel'), language === 'zh' ? '记个球首页' : 'JIGEQIU home');
    assert.equal(t('managerHtmlBackupFilename', { date: '2026-11-02' }),
      language === 'zh' ? '记个球_书签备份_2026-11-02.html' : 'jigeqiu_bookmarks_backup_2026-11-02.html');
  }
});

test('the page declares a versioned local favicon with genuine multi-size ICO data', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /<link rel="icon" type="image\/x-icon" href="\/favicon\.ico\?v=jigeqiu-1"\s*\/>/);
  const ico = readFileSync(new URL('../../public/favicon.ico', import.meta.url));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + index * 16;
    assert.equal(ico[entry], size);
    assert.equal(ico[entry + 1], size);
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    assert.ok(offset + length <= ico.length);
    assert.equal(ico.subarray(offset, offset + 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(ico.readUInt32BE(offset + 16), size);
    assert.equal(ico.readUInt32BE(offset + 20), size);
  }
});

test('published wallpapers contain only the two supported built-in presets', () => {
  const files = readdirSync(new URL('../../public/wallpapers/', import.meta.url));
  assert.deepEqual(files.filter(file => file.endsWith('.webp')).sort(), [
    'cyan-lake-desktop.webp', 'cyan-lake-mobile.webp', 'cyan-lake-thumb.webp',
    'snow-mountain-desktop.webp', 'snow-mountain-mobile.webp', 'snow-mountain-thumb.webp',
  ]);
});
