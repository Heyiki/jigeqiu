import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import type { ManagementSection } from '../../src/components/account/ManagementShell';
import { navigationMessages } from '../../src/i18n/navigation';
import { resolveLocale } from '../../src/i18n';

function component(file: string, exportName: string) {
  const path = new URL(`../../src/components/${file}.tsx`, import.meta.url);
  const require = createRequire(path);
  const module = { exports: {} as Record<string, (props: any) => React.ReactElement> };
  const source = transformSync(readFileSync(path, 'utf8'), {
    loader: 'tsx', format: 'cjs', jsx: 'automatic',
  }).code;
  new Function('require', 'module', 'exports', source)(
    (id: string) => id === 'react' ? React
      : id === '../../i18n' ? {
        createTranslator: (language?: string) => {
          const locale = resolveLocale(language);
          return (key: keyof typeof navigationMessages) => navigationMessages[key][locale];
        },
        resolveLocale,
      } : require(id),
    module, module.exports,
  );
  return module.exports[exportName];
}

function nodes(tree: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement<{ children?: React.ReactNode }>(tree)) return [];
  return [tree, ...nodes(tree.props.children)];
}
function text(tree: React.ReactNode): string {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join('');
  return React.isValidElement<{ children?: React.ReactNode }>(tree) ? text(tree.props.children) : '';
}
const TopNavigation = component('common/TopNavigation', 'TopNavigation');
const ManagementShell = component('account/ManagementShell', 'ManagementShell');

test('top navigation resolves en-US and keeps the language control in both locales', () => {
  const switched: string[] = [];
  const props = {
    management: false, language: 'en-US', dark: false,
    onHome: () => switched.push('home'), onManagement: () => switched.push('management'),
    onLanguage: () => switched.push('language'), onTheme: () => switched.push('theme'),
  };
  const english = renderToStaticMarkup(React.createElement(TopNavigation, props));
  assert.match(english, /Primary navigation/);
  assert.match(english, />Desktop</);
  assert.match(english, />Manage</);
  assert.match(english, /aria-label="Switch to Chinese"/);
  assert.match(english, /title="Switch to Chinese"/);
  let controls = nodes(TopNavigation(props));
  let languageButton = controls.find(node => node.type === 'button' && node.props['aria-label'] === 'Switch to Chinese');
  assert.ok(languageButton);
  languageButton.props.onClick();
  assert.deepEqual(switched, ['language']);

  props.language = 'zh-CN';
  const chinese = renderToStaticMarkup(React.createElement(TopNavigation, props));
  assert.match(chinese, /一级导航/);
  assert.match(chinese, />桌面</);
  assert.match(chinese, />管理中心</);
  assert.match(chinese, /aria-label="切换为英文"/);
  assert.match(chinese, />中</);
  controls = nodes(TopNavigation(props));
  languageButton = controls.find(node => node.type === 'button' && node.props['aria-label'] === '切换为英文');
  assert.ok(languageButton, 'language control remains available after switching');
  languageButton.props.onClick();
  assert.deepEqual(switched, ['language', 'language']);
});

test('management navigation translates headings, group labels, controls, and mobile options', () => {
  const navigate: string[] = [];
  const markup = (language: string) => renderToStaticMarkup(ManagementShell({
    section: 'appearance', language, onNavigate: (section: ManagementSection) => navigate.push(section),
    children: React.createElement('p', null, 'content'),
  }));
  const english = markup('en-US');
  assert.match(english, /<span[^>]*>Management<\/span>/);
  assert.match(english, /<h1[^>]*>Appearance<\/h1>/);
  assert.match(english, /aria-label="Management section"/);
  assert.match(english, /aria-label="Management navigation"/);
  for (const label of ['My content', 'Preferences', 'Data', 'All bookmarks',
    'Search engines', 'Appearance', 'Import &amp; export', 'Recycle bin']) {
    assert.ok(english.includes(label), `missing English label ${label}`);
  }

  const chinese = markup('zh-CN');
  assert.match(chinese, /<span[^>]*>管理中心<\/span>/);
  assert.match(chinese, /<h1[^>]*>外观<\/h1>/);
  assert.match(chinese, /aria-label="管理中心小节"/);
  assert.match(chinese, /aria-label="管理中心导航"/);
  for (const label of ['我的内容', '偏好设置', '数据管理', '全部收藏', '搜索引擎',
    '外观', '导入与导出', '回收站']) {
    assert.ok(chinese.includes(label), `missing Chinese label ${label}`);
  }

  const tree = ManagementShell({
    section: 'appearance', language: 'en-US', onNavigate: (section: ManagementSection) => navigate.push(section),
    children: React.createElement('p', null, 'content'),
  });
  const select = nodes(tree).find(node => node.type === 'select');
  assert.ok(select);
  select.props.onChange({ target: { value: 'trash' } });
  assert.deepEqual(navigate, ['trash']);
});
