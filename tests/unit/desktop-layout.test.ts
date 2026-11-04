import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calculateDesktopGrid,
  paginateDesktopItems,
  positionDesktopMenu,
  moveDesktopBookmarkToPage,
  desktopDropIntent,
  desktopInsertionIndex,
} from '../../src/components/desktop/desktop-layout';

test('desktop drop targets include the full space between neighboring icons', () => {
  const grid = { columns: 4, cellSize: 136, count: 10 };
  assert.deepEqual(desktopDropIntent({ ...grid, x: 126, y: 32 }), { slot: 1, center: null });
  assert.deepEqual(desktopDropIntent({ ...grid, x: 146, y: 32 }), { slot: 1, center: null });
  assert.deepEqual(desktopDropIntent({ ...grid, x: 204, y: 32 }), { slot: 2, center: 1 });
  assert.deepEqual(desktopDropIntent({ ...grid, x: 68, y: 110 }), { slot: 1, center: null });
});

test('desktop drop targets handle wrapped rows, trailing empty cells and page edges', () => {
  const grid = { columns: 4, cellSize: 136, count: 6 };
  assert.deepEqual(desktopDropIntent({ ...grid, x: -20, y: 150 }), { slot: 4, center: null });
  assert.deepEqual(desktopDropIntent({ ...grid, x: 500, y: 150 }), { slot: 6, center: null });
  assert.deepEqual(desktopDropIntent({ ...grid, x: 800, y: 800 }), { slot: 6, center: null });
  assert.deepEqual(desktopDropIntent({ ...grid, count: 0, x: 0, y: 0 }), { slot: 0, center: null });
});

test('insertion slots account for the source removed before committing a move', () => {
  assert.equal(desktopInsertionIndex(1, 4, 6), 3);
  assert.equal(desktopInsertionIndex(4, 1, 6), 1);
  assert.equal(desktopInsertionIndex(1, 1, 6), 1);
  assert.equal(desktopInsertionIndex(1, 2, 6), 1);
  assert.equal(desktopInsertionIndex(0, 6, 6), 5);
  assert.equal(desktopInsertionIndex(-1, 2, 6), 2);
  assert.equal(desktopInsertionIndex(-1, 6, 6), 6);
  assert.equal(desktopInsertionIndex(-1, 0, 0), 0);
});

test('forward page moves use the post-removal sequence so the bookmark reaches the requested page', () => {
  assert.deepEqual(moveDesktopBookmarkToPage(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'a', 1, 4, 0),
    ['b', 'c', 'd', 'e', 'a', 'f', 'g', 'h']);
});

test('page moves account for folders ahead of bookmarks and tools after them', () => {
  assert.deepEqual(moveDesktopBookmarkToPage(['a', 'b', 'c', 'd', 'e', 'f'], 'a', 1, 4, 2),
    ['b', 'c', 'a', 'd', 'e', 'f']);
  assert.deepEqual(moveDesktopBookmarkToPage(['a', 'b', 'c', 'd'], 'd', 0, 4, 2), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveDesktopBookmarkToPage(['a', 'b'], 'a', 3, 4, 2), ['b', 'a']);
});

test('desktop grid fits stable cells into the already usable rectangle', () => {
  assert.deepEqual(calculateDesktopGrid(1040, 520), { columns: 8, rows: 4, pageSize: 32, cellSize: 130 });
  assert.deepEqual(calculateDesktopGrid(1039, 519), { columns: 8, rows: 3, pageSize: 24, cellSize: 1039 / 8 });
});

test('mobile grid keeps square spacing and enough height for the icon and its single-line name', () => {
  assert.deepEqual(calculateDesktopGrid(390, 389), { columns: 4, rows: 3, pageSize: 12, cellSize: 97.5 });
  assert.deepEqual(calculateDesktopGrid(390, 390), { columns: 4, rows: 4, pageSize: 16, cellSize: 97.5 });
  assert.deepEqual(calculateDesktopGrid(320, 207), { columns: 3, rows: 1, pageSize: 3, cellSize: 320 / 3 });
});

test('grid uses desktop cells from the 640px usable-width breakpoint', () => {
  assert.deepEqual(calculateDesktopGrid(639, 220), { columns: 6, rows: 2, pageSize: 12, cellSize: 106.5 });
  assert.deepEqual(calculateDesktopGrid(640, 220), { columns: 5, rows: 1, pageSize: 5, cellSize: 128 });
});

test('shrinking usable height for the Dock reduces rows without a second inset', () => {
  assert.deepEqual(calculateDesktopGrid(1040, 416), { columns: 8, rows: 3, pageSize: 24, cellSize: 130 });
});
test('desktop uses moderate spacing while mobile retains a usable compact grid', () => {
  assert.equal(calculateDesktopGrid(1088, 700).cellSize, 136);
  assert.equal(calculateDesktopGrid(366, 700).cellSize, 122);
});

test('unmeasured, negative and non-finite grid dimensions retain one cell', () => {
  for (const dimension of [0, -10, NaN, Infinity, -Infinity]) {
    assert.deepEqual(calculateDesktopGrid(dimension, dimension), { columns: 1, rows: 1, pageSize: 1, cellSize: 96 });
  }
  assert.deepEqual(calculateDesktopGrid(10, 10), { columns: 1, rows: 1, pageSize: 1, cellSize: 96 });
});

test('row spacing matches actual column spacing across responsive widths', () => {
  for (const width of [288, 366, 390, 639, 640, 937, 1088, 1600]) {
    const grid = calculateDesktopGrid(width, 700);
    assert.equal(grid.cellSize, width / grid.columns, `Square grid at ${width}px`);
    assert.ok(grid.cellSize >= 96, 'An icon and its label fit inside a row');
    assert.ok(grid.rows * grid.cellSize <= 700, 'Page capacity fits within the measured height');
    assert.ok((grid.rows + 1) * grid.cellSize > 700, 'Capacity uses every complete square row');
  }
});
test('pagination preserves input order and item identity without inserting an add item', () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
  const pages = paginateDesktopItems(items, 2);
  assert.deepEqual(pages, [[items[0], items[1]], [items[2], items[3]], [items[4]]]);
  assert.equal(pages[0][0], items[0]);
  pages[0].pop();
  assert.equal(items.length, 5);
});

test('an exact full page does not create a trailing add-only page', () => {
  assert.deepEqual(paginateDesktopItems([1, 2, 3, 4], 2), [[1, 2], [3, 4]]);
  assert.deepEqual(paginateDesktopItems([1, 2], 2), [[1, 2]]);
});

test('empty desktops retain one empty page for the UI empty-state action', () => {
  assert.deepEqual(paginateDesktopItems([], 12), [[]]);
});

test('pagination rejects invalid page sizes instead of looping or dropping items', () => {
  for (const size of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => paginateDesktopItems([1, 2], size), RangeError);
  }
});

test('menu keeps its requested position when it fits inside the viewport gutter', () => {
  assert.deepEqual(positionDesktopMenu({
    x: 100, y: 120, width: 200, height: 250, viewportWidth: 1000, viewportHeight: 800,
  }), { left: 100, top: 120, maxHeight: 784 });
});

test('menu shifts away from the viewport right edge and above the Dock', () => {
  assert.deepEqual(positionDesktopMenu({
    x: 990, y: 790, width: 200, height: 250,
    viewportWidth: 1000, viewportHeight: 800, bottomInset: 100,
  }), { left: 792, top: 442, maxHeight: 684 });
});

test('tall menus expose a bounded scroll height entirely above the Dock', () => {
  assert.deepEqual(positionDesktopMenu({
    x: 380, y: 800, width: 220, height: 900,
    viewportWidth: 390, viewportHeight: 844, bottomInset: 100,
  }), { left: 162, top: 8, maxHeight: 728 });
});

test('negative menu coordinates and inset cannot push the menu outside the top-left gutter', () => {
  assert.deepEqual(positionDesktopMenu({
    x: -20, y: -30, width: 200, height: 100,
    viewportWidth: 390, viewportHeight: 844, bottomInset: -20,
  }), { left: 8, top: 8, maxHeight: 828 });
});

test('oversized menus anchor at the left gutter and exhausted viewport has zero scroll height', () => {
  assert.deepEqual(positionDesktopMenu({
    x: 100, y: 100, width: 600, height: 300,
    viewportWidth: 390, viewportHeight: 100, bottomInset: 200,
  }), { left: 8, top: 0, maxHeight: 0 });
  assert.deepEqual(positionDesktopMenu({
    x: 100, y: 100, width: 20, height: 20, viewportWidth: 10, viewportHeight: 10,
  }), { left: 5, top: 5, maxHeight: 0 });
});

test('non-finite menu measurements yield finite bounded positions', () => {
  assert.deepEqual(positionDesktopMenu({
    x: NaN, y: Infinity, width: Infinity, height: NaN,
    viewportWidth: NaN, viewportHeight: Infinity, bottomInset: Infinity,
  }), { left: 0, top: 0, maxHeight: 0 });
});
