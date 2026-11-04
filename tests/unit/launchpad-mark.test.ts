import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LaunchpadMark } from '../../src/components/common/LaunchpadMark';

test('launchpad mark is one decorative, scalable nine-dot grid shared by both entry points', () => {
  const html = renderToStaticMarkup(React.createElement(LaunchpadMark, { size: 32 }));
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /width:32px;height:32px/);
  assert.equal((html.match(/launchpad-mark-dot/g) ?? []).length, 9);
  assert.match(html, /launchpad-mark-center/);
  assert.doesNotMatch(html, /<svg|<img|tabindex|gradient/);
});
