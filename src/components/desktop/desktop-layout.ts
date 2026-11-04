function nonnegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function moveDesktopBookmarkToPage(
  bookmarkIds: readonly string[], sourceId: string, page: number, pageSize: number, leadingFolders: number,
): string[] {
  const next = bookmarkIds.filter(id => id !== sourceId);
  const slot = Math.min(next.length, Math.max(0, page * pageSize - leadingFolders));
  next.splice(slot, 0, sourceId);
  return next;
}

export const DESKTOP_MIN_CELL_SIZE = 96;

export function desktopDropIntent(input: {
  x: number; y: number; columns: number; cellSize: number; count: number;
}): { slot: number; center: number | null } {
  const { columns, cellSize, count } = input;
  const x = Math.max(0, Math.min(columns * cellSize - 1, input.x));
  const y = Math.max(0, input.y);
  const row = Math.floor(y / cellSize);
  const column = Math.floor(x / cellSize);
  const index = row * columns + column;
  const dx = x - (column + 0.5) * cellSize;
  const dy = y - row * cellSize;
  return {
    slot: Math.min(count, index + (dx >= 0 ? 1 : 0)),
    center: index < count && Math.abs(dx) <= 24 && dy >= 8 && dy <= 64 ? index : null,
  };
}

// Slots refer to the visible sequence, while move commands use the sequence after removal.
export function desktopInsertionIndex(sourceIndex: number, slot: number, count: number): number {
  const inSequence = sourceIndex >= 0;
  return Math.max(0, Math.min(count - (inSequence ? 1 : 0), slot - (inSequence && sourceIndex < slot ? 1 : 0)));
}

// Width and height are the measured content area, with Dock and padding excluded.
export function calculateDesktopGrid(width: number, height: number): {
  columns: number; rows: number; pageSize: number; cellSize: number;
} {
  const usableWidth = nonnegative(width);
  const mobile = usableWidth < 640;
  const columns = Math.max(1, Math.floor(usableWidth / (mobile ? DESKTOP_MIN_CELL_SIZE : 128)));
  const cellSize = Math.max(DESKTOP_MIN_CELL_SIZE, usableWidth / columns);
  const rows = Math.max(1, Math.floor(nonnegative(height) / cellSize));
  return { columns, rows, pageSize: columns * rows, cellSize };
}

export function paginateDesktopItems<T>(items: readonly T[], pageSize: number): T[][] {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new RangeError('pageSize must be a positive safe integer');
  }
  if (items.length === 0) return [[]];
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += pageSize) {
    pages.push(items.slice(index, index + pageSize));
  }
  return pages;
}

// The caller applies maxHeight with overflow-y:auto and constrains menu width.
export function positionDesktopMenu(input: {
  x: number; y: number; width: number; height: number;
  viewportWidth: number; viewportHeight: number; bottomInset?: number;
}): { left: number; top: number; maxHeight: number } {
  const viewportWidth = nonnegative(input.viewportWidth);
  const bottom = Math.max(0, nonnegative(input.viewportHeight) - nonnegative(input.bottomInset ?? 0));
  const horizontalGutter = Math.min(8, viewportWidth / 2);
  const verticalGutter = Math.min(8, bottom / 2);
  const maxHeight = Math.max(0, bottom - 2 * verticalGutter);
  const rightmost = Math.max(horizontalGutter, viewportWidth - horizontalGutter - nonnegative(input.width));
  const lowest = Math.max(verticalGutter, bottom - verticalGutter - Math.min(nonnegative(input.height), maxHeight));
  return {
    left: Math.min(rightmost, Math.max(horizontalGutter, nonnegative(input.x))),
    top: Math.min(lowest, Math.max(verticalGutter, nonnegative(input.y))),
    maxHeight,
  };
}
