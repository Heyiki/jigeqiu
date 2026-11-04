import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { transformSync } from 'esbuild';
import { preferenceSaveError } from '../../src/services/preference-save-error';

function harness() {
  const state: unknown[] = [];
  let cursor = 0;
  const hooks = {
    ...React,
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value: unknown) => { state[index] = value; }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in state)) state[index] = { current: initial };
      return state[index];
    },
    useEffect() {},
    useLayoutEffect() {},
  };
  function load(file: string, overrides: Record<string, unknown> = {}) {
    const path = new URL(`../../src/components/desktop/${file}.tsx`, import.meta.url);
    const require = createRequire(path);
    const module = { exports: {} as Record<string, any> };
    new Function('require', 'module', 'exports', 'document',
      transformSync(readFileSync(path, 'utf8'), { loader: 'tsx', format: 'cjs', jsx: 'automatic' }).code)(
      (id: string) => id === 'react' ? hooks
        : id === 'react-dom' ? { createPortal: (child: unknown) => child }
        : Object.hasOwn(overrides, id) ? overrides[id] : require(id),
      module, module.exports, { body: {} },
    );
    return module.exports;
  }
  const dialog = load('DesktopDialog');
  return {
    load: (file: string) => load(file, { './DesktopDialog': dialog }),
    action(language: string): { busy: boolean; error: string; run(action: () => void | Promise<void>): Promise<void> } {
      cursor = 0;
      return dialog.useDesktopDialogAction(language);
    },
    render(component: (props: any) => React.ReactNode, props: object) {
      cursor = 0;
      return component(props);
    },
  };
}

function nodes(tree: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement<{ children?: React.ReactNode }>(tree)) return [];
  return [tree, ...nodes(tree.props.children)];
}

const failures = [
  new Error('COMMIT_UNCERTAIN'),
  { code: 'COMMIT_UNCERTAIN' },
  Object.assign(new Error('readback failed'), { code: 'COMMIT_UNCERTAIN' }),
  new Error('CONFLICT'),
  new Error('LOCK_UNAVAILABLE'),
  new Error('INVALID_REFERENCE'),
  new Error('STORAGE_UNAVAILABLE'),
  new Error('QUOTA_EXCEEDED'),
  new DOMException('full', 'QuotaExceededError'),
  new DOMException('blocked', 'SecurityError'),
];

for (const language of ['en', 'zh']) {
  for (const [index, cause] of failures.entries()) {
    test(`desktop dialog persistence error ${index} uses ${language} library guidance`, async () => {
      const view = harness();
      await view.action(language).run(() => { throw cause; });
      assert.equal(view.action(language).error, preferenceSaveError(cause, language, 'library'));
      assert.equal(view.action(language).busy, false);
    });
  }
}

test('desktop dialog retains validation and stale-preview guidance', async () => {
  const view = harness();
  await view.action('en').run(() => { throw new Error('INVALID_INPUT'); });
  assert.equal(view.action('en').error,
    'The operation failed. Your input is kept; check local data and retry.');
  await view.action('en').run(() => { throw new Error('PREVIEW_STALE'); });
  assert.equal(view.action('en').error,
    'Local data changed. Keep your input and refresh before retrying.');
});

test('desktop confirmation uncertainty keeps confirmation open with no rollback or blind-retry claim', async () => {
  const view = harness();
  const { DesktopConfirmPopover } = view.load('DesktopConfirmPopover');
  let writes = 0;
  let closes = 0;
  const cause = new Error('COMMIT_UNCERTAIN');
  const props = {
    language: 'en', onClose: () => { closes++; },
    confirmation: {
      x: 0, y: 0, title: 'Remove shortcut', message: 'Remove?', label: 'Confirm',
      action: () => { writes++; throw cause; },
    },
  };
  const render = () => nodes(view.render(DesktopConfirmPopover, props));
  render().find(node => node.type === 'button' && node.props.children === 'Confirm')!.props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes, 1);
  assert.equal(closes, 0);
  const message = render().find(node => node.props.role === 'alert')!.props.children;
  assert.equal(message, preferenceSaveError(cause, 'en', 'library'));
  assert.doesNotMatch(message, /not saved|not applied|then try again/i);
});

test('desktop confirmation closes once after successful write', async () => {
  const view = harness();
  const { DesktopConfirmPopover } = view.load('DesktopConfirmPopover');
  const events: string[] = [];
  const tree = view.render(DesktopConfirmPopover, {
    language: 'en', onClose: () => events.push('close'),
    confirmation: {
      x: 0, y: 0, title: 'Remove shortcut', message: 'Remove?', label: 'Confirm',
      action: () => events.push('write'),
    },
  });
  nodes(tree).find(node => node.type === 'button' && node.props.children === 'Confirm')!.props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['write', 'close']);
});
