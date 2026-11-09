import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FaviconImage } from '../../src/components/common/FaviconImage';

const render = (title: string, size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'lg', url = 'https://example.com') =>
  renderToStaticMarkup(React.createElement(FaviconImage, { title, size, url, iconBg: '#ff00ff' }));

for (const size of ['xs', 'sm', 'md', 'lg', 'xl'] as const) {
  test(`Chinese fallback exposes more of the inner sides of both glyphs at ${size}`, () => {
    const markup = render('中文工具', size);
    assert.match(markup, /data-fallback-kind="han-pair"/);
    assert.match(markup, /data-half="right"[^>]*>中<\/text>/);
    assert.match(markup, /data-half="left"[^>]*>文<\/text>/);
    assert.match(markup, /<text x="5.2" y="32"/);
    assert.match(markup, /<text x="58.8" y="32"/);
    assert.equal((markup.match(/<clipPath /g) ?? []).length, 2);
    assert.match(markup, /class="site-icon-glyph site-icon-glyph-han-pair"/);
    assert.match(markup, /<rect x="0" y="0" width="32" height="64"/);
    assert.match(markup, /<rect x="32" y="0" width="32" height="64"/);
    assert.doesNotMatch(markup, /#ff00ff/);
  });
}

for (const [title, expected] of [
  ['unsplash', 'U'], ['  github ', 'G'], ['360浏览器', '3'], ['中', '中'], ['中A', '中'],
  ['école', 'É'], ['ａｂｃ', 'A'], ['𠮷野家', 'pair'],
] as const) {
  test(`fallback handles title ${title}`, () => {
    const markup = render(title);
    if (expected === 'pair') assert.match(markup, /data-fallback-kind="han-pair"/);
    else {
      assert.match(markup, /data-fallback-kind="initial"/);
      assert.ok(markup.includes(`>${expected}</text>`));
    }
  });
}

test('empty and symbolic names use the hostname initial without printing page secrets', () => {
  for (const title of ['', '  ', '✨!!!']) {
    const markup = render(title, 'sm', 'https://example.com/private?secret=keep');
    assert.ok(markup.includes('>E</text>'));
    assert.doesNotMatch(markup, /secret=keep/);
  }
  assert.match(render('', 'sm', 'javascript:alert(1)'), /data-fallback-kind="generic"/);
});

test('known domains have no hardcoded brand substitution or guessed color', () => {
  const markup = render('GitHub', 'lg', 'https://github.com');
  assert.match(markup, /data-fallback-kind="initial"/);
  assert.ok(markup.includes('>G</text>'));
  assert.doesNotMatch(markup, /#24292f|#ff00ff|fill="white"/);
});

test('forced text mode renders fallback immediately even with a saved image', () => {
  const markup = renderToStaticMarkup(React.createElement(FaviconImage, {
    title: '中文', url: 'https://example.com', icon: 'https://example.com/custom.png', iconMode: 'text',
  }));
  assert.match(markup, /data-icon-state="fallback"/);
  assert.match(markup, /data-fallback-kind="han-pair"/);
});

test('fallback color is stable for a website across paths, schemes, sizes and title changes', () => {
  const tone = (markup: string) => {
    const match = markup.match(/data-fallback-tone="([0-5])"/);
    assert.ok(match, 'Default icons have an assigned color palette');
    return match[1];
  };
  const first = tone(render('中文工具', 'xs', 'https://www.example.com/private?secret=keep'));
  assert.equal(tone(render('New name', 'xl', 'http://example.com/other')), first);
  assert.ok(new Set(Array.from({ length: 24 }, (_, i) =>
    tone(render('工具', 'lg', `https://site-${i}.test`)))).size >= 4,
  'Different websites are distributed across distinct color palettes');
  assert.ok(tone(render('', 'sm', 'javascript:alert(1)')));
});
