export const DEFAULT_LAUNCHPAD_BLUR = 12;
export const MAX_LAUNCHPAD_BLUR = 30;

export function normalizeLaunchpadBlur(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_LAUNCHPAD_BLUR, Math.max(0, Math.round(value)))
    : DEFAULT_LAUNCHPAD_BLUR;
}
