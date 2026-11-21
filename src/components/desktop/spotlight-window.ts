export const SPOTLIGHT_ROW_HEIGHT = 72;
const OVERSCAN = 4;

export function spotlightWindow(count: number, top: number, height: number) {
  const visible = Math.ceil(Math.max(0, height) / SPOTLIGHT_ROW_HEIGHT);
  const first = Math.min(Math.max(0, count - visible), Math.floor(Math.max(0, top) / SPOTLIGHT_ROW_HEIGHT));
  return {
    start: Math.max(0, first - OVERSCAN),
    end: Math.min(count, first + visible + OVERSCAN),
  };
}

export function spotlightScrollTarget(index: number, top: number, height: number) {
  const start = index * SPOTLIGHT_ROW_HEIGHT;
  if (start < top) return start;
  if (start + SPOTLIGHT_ROW_HEIGHT > top + height) return Math.max(0, start + SPOTLIGHT_ROW_HEIGHT - height);
  return top;
}
