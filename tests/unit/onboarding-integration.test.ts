import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = (path: string) => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');
test('closing duplicate handoffs cancels teaching and tour cannot outlive the desktop route', () => {
  const app = source('PrototypeApp.tsx');
  assert.match(app, /const openBookmarkEditor[\s\S]*?onboarding\.cancelTask\(\)/);
  assert.match(app, /onOpenExisting=\{bm => \{\s*onboarding\.cancelTask\(\)/);
  assert.match(app, /phase === 'tour'[\s\S]*?route\.page !== 'desktop'[\s\S]*?onboarding\.exit\(\)/);
});
test('desktop and taskbar clear published interaction state when unmounted', () => {
  for (const file of ['desktop/DesktopView.tsx', 'dock/BottomDock.tsx']) {
    assert.match(source(`components/${file}`), /useEffect\(\(\) => \(\) => onInteractionChange\?\.\(false\)/);
  }
});
