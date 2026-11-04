import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { transformSync } from 'esbuild';

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
function harness(language: string | undefined = 'en-US', result?: object) {
  const path = new URL('../../src/components/common/SiteIconPicker.tsx', import.meta.url);
  const require = createRequire(path);
  const state: unknown[] = [];
  let cursor = 0;
  const hooks = {
    ...React,
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in state)) state[index] = index === 2 && result ? result : initial;
      return [state[index], (value: any) => {
        state[index] = typeof value === 'function' ? value(state[index]) : value;
      }];
    },
    useRef: (current: unknown) => ({ current }),
    useEffect() {},
    useSyncExternalStore: () => false,
  };
  const module = { exports: {} as { SiteIconPicker: (props: object) => React.ReactElement<any> } };
  new Function('require', 'module', 'exports',
    transformSync(readFileSync(path, 'utf8'), { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code)(
    (id: string) => id === 'react' ? hooks : require(id), module, module.exports,
  );
  const changes: unknown[] = [];
  const props = {
    language, url: 'https://example.com/', title: '',
    value: { iconMode: 'auto' }, onChange: (value: unknown) => changes.push(value),
  };
  const render = () => { cursor = 0; return module.exports.SiteIconPicker(props); };
  const find = (predicate: (node: React.ReactElement<any>) => boolean) => {
    const node = nodes(render()).find(predicate);
    assert.ok(node, 'Missing control');
    return node;
  };
  const button = (label: string) => find(node => node.type === 'button'
    && (node.props['aria-label'] === label || text(node) === label));
  const expand = () => find(node => node.props['aria-expanded'] !== undefined).props.onClick();
  return { props, render, find, button, expand, changes };
}

test('icon picker resolves en-US and translates controls without changing selection', () => {
  const view = harness();
  assert.equal(view.render().props['aria-label'], 'Website icon');
  view.expand();
  assert.ok(view.button('Automatic'));
  view.button('Text icon').props.onClick();
  assert.deepEqual(view.changes, [{ iconMode: 'text' }]);
  view.props.language = 'zh';
  assert.equal(view.render().props['aria-label'], '网站图标');
  assert.ok(view.button('文字图标'));
});

test('icon picker interpolates candidate dimensions and counts and preserves the chosen URL', () => {
  const view = harness('en-US', {
    url: 'https://example.com/', loading: false,
    items: [
      { url: 'https://example.com/a.png', kind: 'manifest', width: 256, height: 128 },
      { url: 'https://example.com/b.png', kind: 'logo', width: 180, height: 180 },
    ],
  });
  view.expand();
  assert.match(text(view.render()), /Found 2 icons/);
  view.button('Choose app icon 256×128').props.onClick();
  assert.deepEqual(view.changes, [{ iconMode: 'custom', icon: 'https://example.com/a.png' }]);
  assert.ok(view.button('Choose page logo 180×180'));
  view.props.language = 'zh';
  assert.match(text(view.render()), /找到 2 个图标/);
  assert.ok(view.button('选择应用图标 256×128'));
});

test('image errors change language without clearing the URL draft or submitting it', () => {
  const view = harness();
  view.expand();
  view.find(node => node.props.role === 'tab' && text(node) === 'Image URL').props.onClick();
  view.find(node => node.type === 'input').props.onChange({ target: { value: 'https://example.com/manual.png' } });
  view.find(node => node.type === 'img').props.onError();
  assert.match(text(view.render()), /Could not load the image/);
  view.props.language = 'zh';
  assert.match(text(view.render()), /图片无法加载/);
  assert.equal(view.find(node => node.type === 'input').props.value, 'https://example.com/manual.png');
  assert.equal(view.button('使用图片').props.disabled, true);
  assert.deepEqual(view.changes, []);
});

test('omitting language preserves Chinese labels and invalid-link feedback', () => {
  const view = harness('zh');
  delete (view.props as { language?: string }).language;
  assert.equal(view.render().props['aria-label'], '网站图标');
  view.expand();
  view.find(node => node.props.role === 'tab' && text(node) === '图片链接').props.onClick();
  view.find(node => node.type === 'input').props.onChange({ target: { value: 'data:image/png;evil' } });
  assert.match(text(view.render()), /请输入有效的 HTTP\(S\) 图片链接/);
  assert.equal(view.button('使用图片').props.disabled, true);
});
