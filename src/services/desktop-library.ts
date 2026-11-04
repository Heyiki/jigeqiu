import type { AssetAction } from '../domain/assets/commands';
import type { AssetSnapshot, Layout } from '../domain/assets/model';
import { reduceCommand } from '../domain/assets/reducer';
import { captureJsonInput, validateSnapshot } from '../domain/assets/validation';
import type { Bookmark, Folder } from '../types';

export type DesktopAction = Extract<AssetAction, { type: `desktop.${string}` }>;
export interface DesktopLibrary { bookmarks: Bookmark[]; folders: Folder[] }

export function emptyDesktopLayout(): Layout {
  return { shortcuts: [], folders: [], root: [], dock: [] };
}

// Only identities participate in layout rules. Legacy asset fields remain untouched.
function snapshot(library: DesktopLibrary, layout: unknown): AssetSnapshot {
  return {
    library: {
      bookmarks: library.bookmarks.map(({ id }) => ({
        id, title: '', url: 'https://desktop.invalid/', icon: null, notes: '',
        keywords: [], createdAt: 0, updatedAt: 0,
      })),
      // Empty flat placeholders reserve original directory IDs across the entire batch.
      folders: library.folders.map(({ id }) => ({ id, name: '', children: [], createdAt: 0, updatedAt: 0 })),
      root: [
        ...library.bookmarks.map(({ id }) => ({ kind: 'bookmark' as const, id })),
        ...library.folders.map(({ id }) => ({ kind: 'folder' as const, id })),
      ],
    },
    layout: layout as Layout, collections: [], trash: [],
  };
}

export function validateDesktopLayout(library: DesktopLibrary, layout: unknown): Layout {
  const checked = validateSnapshot(snapshot(library, layout));
  if (!checked.ok) throw new Error('CORRUPT_DATA');
  return checked.value.layout;
}

export function applyDesktopActions(library: DesktopLibrary, layout: Layout, actions: DesktopAction[]): Layout {
  const captured = captureJsonInput(actions);
  if (!captured.ok || !Array.isArray(captured.value)
    || captured.value.some(action => !action || typeof action !== 'object' || Array.isArray(action)
      || typeof action.type !== 'string' || !action.type.startsWith('desktop.'))) throw new Error('INVALID_INPUT');
  const result = reduceCommand(snapshot(library, layout), {
    commandId: crypto.randomUUID(), expected: null, at: Date.now(),
    actions: captured.value as DesktopAction[],
  });
  if (!result.ok) throw new Error(result.error.code);
  return validateDesktopLayout(library, result.value.next.layout);
}

export function reconcileDesktopLayout(before: DesktopLibrary, next: DesktopLibrary, value: unknown): Layout {
  const layout = validateDesktopLayout(before, value);
  const bookmarks = new Set(next.bookmarks.map(item => item.id));
  layout.shortcuts = layout.shortcuts.filter(item => bookmarks.has(item.bookmarkId));
  const shortcuts = new Set(layout.shortcuts.map(item => item.id));
  layout.root = layout.root.filter(ref => ref.kind === 'desktop-folder' || shortcuts.has(ref.id));
  for (const folder of layout.folders) folder.shortcutIds = folder.shortcutIds.filter(id => shortcuts.has(id));
  layout.dock = layout.dock.filter(item => bookmarks.has(item.bookmarkId));
  return validateDesktopLayout(next, layout);
}
