import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageManager } from '../../src/services/storage';
import { configureApplicationStorage } from '../../src/services/application-storage';
import { MemoryStorage } from '../support/memory-storage';

test('launchpad blur defaults safely for old preferences and bounds stored values', () => {
  configureApplicationStorage(undefined);
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  for (const [value, expected] of [
    [undefined, 12], [null, 12], ['20', 12], [0, 0], [18, 18], [18.6, 19], [-5, 0], [60, 30],
  ] as const) {
    memory.setItem('jipage_settings_v1', JSON.stringify({ launchpadBackgroundBlur: value }));
    assert.equal(new StorageManager().getUserSettings().launchpadBackgroundBlur, expected);
  }
});

test('launchpad blur saves zero and clamps new preferences without changing other settings', () => {
  configureApplicationStorage(undefined);
  const memory = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  const manager = new StorageManager();
  manager.saveUserSettings({ wallpaperPreset: 'green-lake' });
  for (const [value, expected] of [[0, 0], [21, 21], [99, 30], [NaN, 12]] as const) {
    assert.equal(manager.saveUserSettings({ launchpadBackgroundBlur: value }).launchpadBackgroundBlur, expected);
    assert.equal(new StorageManager().getUserSettings().launchpadBackgroundBlur, expected);
    assert.equal(manager.getUserSettings().wallpaperPreset, 'green-lake');
  }
});
