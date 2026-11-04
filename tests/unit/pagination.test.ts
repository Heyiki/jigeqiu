import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Pagination } from '../../src/components/common/Pagination';

function elements(tree: React.ReactNode): React.ReactElement<Record<string, any>>[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!React.isValidElement<{ children?: React.ReactNode }>(tree)) return [];
  return [tree, ...elements(tree.props.children)];
}

test('shared pagination renders bounded page numbers and routes page and size actions', () => {
  const pages: number[] = [], sizes: number[] = [];
  const tree = Pagination({ total: 1500, page: 50, pageSize: 15, language: 'en',
    onPageChange: page => pages.push(page), onPageSizeChange: size => sizes.push(size) });
  const nodes = elements(tree);
  const buttons = nodes.filter(node => node.type === 'button');
  assert.equal(buttons.length, 9);
  assert.equal(buttons.find(node => node.props['aria-current'] === 'page')?.props.children, 50);
  for (const name of ['First page', 'Previous page', 'Next page', 'Last page']) {
    const button = buttons.find(node => node.props['aria-label'] === name);
    assert.ok(button);
    button.props.onClick();
  }
  assert.deepEqual(pages, [1, 49, 51, 100]);
  nodes.find(node => node.type === 'select')!.props.onChange({ target: { value: '30' } });
  assert.deepEqual(sizes, [30]);
  assert.match(renderToStaticMarkup(tree), /15.*30.*50.*100/);
});

test('pagination handles zero, boundary pages, bilingual copy and pending state', () => {
  const props = { total: 1, page: 1, pageSize: 15, onPageChange() {}, onPageSizeChange() {} };
  assert.equal(Pagination({ ...props, total: 0 }), null);
  for (const language of ['zh', 'en']) {
    const tree = Pagination({ ...props, language });
    assert.equal(elements(tree).filter(node => node.type === 'button' && node.props.disabled).length, 4);
    assert.match(renderToStaticMarkup(tree), language === 'zh' ? /下一页/ : /Next page/);
  }
  const pending = elements(Pagination({ ...props, total: 100, disabled: true }));
  assert.ok(pending.filter(node => node.type === 'button' || node.type === 'select').every(node => node.props.disabled));
});
