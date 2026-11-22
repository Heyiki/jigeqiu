import type { GradientBackground } from '../types';

export const GRADIENT_PRESETS = [
  { id: 'mist-blue', label: 'gradientMistBlue', start: '#3b6b89', end: '#a9c7c5', angle: 135 },
  { id: 'sunset', label: 'gradientSunset', start: '#795c91', end: '#e5a18c', angle: 135 },
] as const;

export function normalizeGradient(value?: Partial<GradientBackground> | null): GradientBackground {
  const fallback = GRADIENT_PRESETS[0];
  const color = (input: unknown, otherwise: string) => typeof input === 'string' && /^#[\da-f]{6}$/i.test(input) ? input : otherwise;
  return {
    start: color(value?.start, fallback.start),
    end: color(value?.end, fallback.end),
    angle: typeof value?.angle === 'number' && Number.isFinite(value.angle)
      ? ((value.angle % 360) + 360) % 360 : fallback.angle,
  };
}

export function gradientImage(value?: Partial<GradientBackground> | null): string {
  const { start, end, angle } = normalizeGradient(value);
  return `linear-gradient(${angle}deg, ${start}, ${end})`;
}
