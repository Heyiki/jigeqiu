import { useSyncExternalStore } from 'react';
import type { AppearanceMode } from '../types';

const query = '(prefers-color-scheme: dark)';
const systemIsDark = () => window.matchMedia?.(query).matches ?? false;
const serverIsDark = () => false;
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia?.(query);
  media?.addEventListener('change', onChange);
  return () => media?.removeEventListener('change', onChange);
};
const noSubscription = () => () => {};

export function useAppearanceMode(mode: AppearanceMode): Exclude<AppearanceMode, 'auto'> {
  const dark = useSyncExternalStore(mode === 'auto' ? subscribe : noSubscription, systemIsDark, serverIsDark);
  return mode === 'auto' ? (dark ? 'dark-glass' : 'light-glass') : mode;
}
