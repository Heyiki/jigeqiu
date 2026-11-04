import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { actionTerm } from '../../src/components/common/action-terms';

test('taskbar menu actions use the agreed Chinese and English names', () => {
  assert.equal(actionTerm('pinDock', 'zh'), '固定到任务栏');
  assert.equal(actionTerm('unpinDock', 'zh'), '从任务栏取消固定');
  assert.equal(actionTerm('pinDock', 'en'), 'Pin to Taskbar');
  assert.equal(actionTerm('unpinDock', 'en'), 'Unpin from Taskbar');
});

test('UI copy contains no old Dock or program-dock terminology', () => {
  const files = ['PrototypeApp.tsx', 'components/common/action-terms.ts',
    'components/dock/BottomDock.tsx', 'components/desktop/DesktopGuide.tsx',
    'components/desktop/Launchpad.tsx', 'components/desktop/FolderModal.tsx',
    'components/desktop/DesktopWindow.tsx', 'components/account/UserCenterView.tsx',
    'components/account/JsonAssetTransfer.tsx'];
  const violations: string[] = [];
  for (const file of files) {
    const lines = readFileSync(new URL(`../../src/${file}`, import.meta.url), 'utf8').split('\n');
    for (const line of lines) {
      if (line.trim().startsWith('//') || line.trim().startsWith('{/*')) continue;
      if (/\bDock\b|程序坞/.test(line)) violations.push(`${file}: ${line.trim()}`);
    }
  }
  assert.deepEqual(violations, []);
});
