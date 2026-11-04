import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { transformSync } from 'esbuild';

test('batch open requests synchronously, does not claim success or close, and keeps individual links', () => {
  const path = new URL('../../src/components/collections/BatchOpenModal.tsx', import.meta.url);
  const require = createRequire(path);
  const state: unknown[] = [];
  let cursor = 0, closed = 0;
  const hooks = { ...React, useState(initial: unknown) {
    const index = cursor++;
    if (!(index in state)) state[index] = initial;
    return [state[index], (next: unknown) => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
  } };
  const compiled = transformSync(readFileSync(path, 'utf8'), { loader: 'tsx', format: 'cjs' }).code;
  const module = { exports: {} as { BatchOpenModal: (props: object) => React.ReactElement } };
  new Function('require', 'module', 'exports', compiled)(
    (id: string) => id === 'react' ? hooks : require(id), module, module.exports,
  );
  function elements(tree: React.ReactNode): React.ReactElement<any>[] {
    if (Array.isArray(tree)) return tree.flatMap(elements);
    if (!React.isValidElement<{ children?: React.ReactNode }>(tree)) return [];
    return [tree, ...elements(tree.props.children)];
  }
  const items = ['https://one.test/', 'https://two.test/'].map((url, order) =>
    ({ bookmarkId: '', title: `Site ${order}`, domain: new URL(url).hostname, url, order }));
  const render = () => {
    cursor = 0;
    return module.exports.BatchOpenModal({ isOpen: true, onClose: () => closed++, collectionTitle: 'Tools', items });
  };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const opened: string[] = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    open: (url: string) => { opened.push(url); return null; },
  } });
  try {
    const action = elements(render()).filter(n => n.type === 'button').at(-1)!;
    action.props.onClick();
    assert.deepEqual(opened, items.map(i => i.url), 'All requests stay in the user gesture');
    const tree = elements(render());
    assert.equal(closed, 0, 'Do not close before the user can use fallback links');
    assert.equal(tree.filter(n => n.type === 'a').length, 2);
    const text = JSON.stringify(tree.map(n => n.props.children), (_, v) => typeof v === 'function' ? undefined : v);
    assert.match(text, /已发起|requested/);
    assert.doesNotMatch(text, /成功打开|正在打开/);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
