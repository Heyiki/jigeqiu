import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TopNavigation } from '../../src/components/common/TopNavigation';
import { ManagementShell, type ManagementSection } from '../../src/components/account/ManagementShell';

const noop = () => {};

test('top navigation has exactly two primary destinations and a visible language control', () => {
  for (const language of ['zh', 'en']) {
    const html = renderToStaticMarkup(React.createElement(TopNavigation, {
      management: true, language, dark: false, onHome: noop, onManagement: noop, onLanguage: noop, onTheme: noop,
    }));
    assert.equal((html.match(/<button/g) ?? []).length, 5);
    assert.match(html, language === 'en' ? /Switch to Chinese/ : /切换为英文/);
    assert.match(html, language === 'en' ? />EN</ : />中</);
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /探索|插件|个人分类|添加收藏|全部收藏|账号|头像/);
  }
});

test('open-source management has five sections and no collection entry', () => {
  const sections: ManagementSection[] = ['bookmarks', 'engines', 'appearance', 'import-export', 'trash'];
  for (const language of ['zh', 'en']) {
    for (const section of sections) {
      const html = renderToStaticMarkup(React.createElement(ManagementShell, {
        section, onNavigate: noop, language, children: React.createElement('div', null, 'Content'),
      }));
      assert.equal((html.match(/<option /g) ?? []).length, 5);
      assert.equal((html.match(/<optgroup /g) ?? []).length, 3);
      assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
      assert.match(html, new RegExp(`value="${section}" selected=""`));
      assert.doesNotMatch(html, /投稿|分类定制|快捷键设置|账号|探索|插件|网址单|My collections|value="collections"/);
      assert.match(html, language === 'en' ? /My content/ : /我的内容/);
    }
  }
});
