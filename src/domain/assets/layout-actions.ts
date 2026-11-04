import type { ActionContext } from './command-context';
import type { AssetAction, DesktopTarget } from './commands';
import type { DesktopFolder, Id } from './model';

export function applyLayoutAction(
  ctx: ActionContext,
  action: Extract<AssetAction, { type: `desktop.${string}` | `dock.${string}` }>,
): void {
  const { layout, library } = ctx.snapshot;

  function bookmark(id: Id): void {
    if (!library.bookmarks.some(item => item.id === id)) ctx.reject('NOT_FOUND', { id });
  }

  function folder(id: Id): DesktopFolder {
    const found = layout.folders.find(item => item.id === id);
    if (!found) ctx.reject('NOT_FOUND', { id });
    return found;
  }

  function shortcut(id: Id) {
    const found = layout.shortcuts.find(item => item.id === id);
    if (!found) ctx.reject('NOT_FOUND', { id });
    return found;
  }

  function name(value: string): void {
    if (typeof value !== 'string' || !value.trim()) ctx.reject('INVALID_INPUT', { field: 'name' });
  }

  function index(value: number, length: number): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > length) {
      ctx.reject('INVALID_INPUT', { field: 'index', length });
    }
  }

  function target(to: DesktopTarget): DesktopFolder | null {
    if (to.kind === 'root') return null;
    if (to.kind !== 'folder') ctx.reject('INVALID_INPUT', { field: 'to.kind' });
    const found = layout.folders.find(item => item.id === to.folderId);
    if (!found) ctx.reject('INVALID_REFERENCE', { id: to.folderId });
    return found;
  }

  function length(container: DesktopFolder | null): number {
    return container ? container.shortcutIds.length : layout.root.length;
  }

  function source(id: Id): DesktopFolder | null {
    if (layout.root.some(ref => ref.kind === 'shortcut' && ref.id === id)) return null;
    const found = layout.folders.find(item => item.shortcutIds.includes(id));
    if (!found) ctx.reject('INVALID_REFERENCE', { id });
    return found;
  }

  function markShortcut(id: Id): void {
    ctx.affected.add(shortcut(id).bookmarkId);
    ctx.affected.add(id);
  }

  function detach(id: Id): void {
    const container = source(id);
    if (container) {
      container.shortcutIds.splice(container.shortcutIds.indexOf(id), 1);
      ctx.affected.add(container.id);
    } else {
      layout.root.splice(layout.root.findIndex(ref => ref.kind === 'shortcut' && ref.id === id), 1);
    }
    markShortcut(id);
  }

  function insert(id: Id, container: DesktopFolder | null, position: number): void {
    if (container) {
      container.shortcutIds.splice(position, 0, id);
      ctx.affected.add(container.id);
    } else {
      layout.root.splice(position, 0, { kind: 'shortcut', id });
    }
    markShortcut(id);
  }

  switch (action.type) {
    case 'desktop.pin': {
      bookmark(action.bookmarkId);
      const container = target(action.to);
      index(action.to.index, length(container));
      const existing = layout.shortcuts.find(item => item.bookmarkId === action.bookmarkId);
      if (existing) {
        markShortcut(existing.id);
        return;
      }
      ctx.claim(action.shortcutId);
      layout.shortcuts.push({ id: action.shortcutId, bookmarkId: action.bookmarkId });
      insert(action.shortcutId, container, action.to.index);
      return;
    }
    case 'desktop.unpin': {
      bookmark(action.bookmarkId);
      const existing = layout.shortcuts.find(item => item.bookmarkId === action.bookmarkId);
      if (!existing) return;
      detach(existing.id);
      layout.shortcuts.splice(layout.shortcuts.indexOf(existing), 1);
      return;
    }
    case 'desktop.folder.create': {
      name(action.name);
      const selected = new Set(action.shortcutIds);
      if (selected.size !== action.shortcutIds.length) {
        ctx.reject('INVALID_INPUT', { field: 'shortcutIds', reason: 'duplicate' });
      }
      for (const id of action.shortcutIds) {
        shortcut(id);
        source(id);
      }
      const removedRoots = layout.root.filter(ref => ref.kind === 'shortcut' && selected.has(ref.id)).length;
      index(action.index, layout.root.length - removedRoots);
      ctx.claim(action.id);
      for (const id of action.shortcutIds) detach(id);
      layout.folders.push({ id: action.id, name: action.name, shortcutIds: [...action.shortcutIds] });
      layout.root.splice(action.index, 0, { kind: 'desktop-folder', id: action.id });
      ctx.affected.add(action.id);
      return;
    }
    case 'desktop.folder.rename': {
      name(action.name);
      folder(action.id).name = action.name;
      ctx.affected.add(action.id);
      return;
    }
    case 'desktop.move': {
      const container = target(action.to);
      if (action.ref.kind === 'desktop-folder') {
        folder(action.ref.id);
        if (container) ctx.reject('INVALID_REFERENCE', { id: action.ref.id, reason: 'desktop-folder-nesting' });
        const position = layout.root.findIndex(ref => ref.kind === 'desktop-folder' && ref.id === action.ref.id);
        if (position < 0) ctx.reject('INVALID_REFERENCE', { id: action.ref.id });
        index(action.to.index, layout.root.length - 1);
        const [ref] = layout.root.splice(position, 1);
        layout.root.splice(action.to.index, 0, ref);
        ctx.affected.add(action.ref.id);
        return;
      }
      if (action.ref.kind !== 'shortcut') ctx.reject('INVALID_INPUT', { field: 'ref.kind' });
      shortcut(action.ref.id);
      const previous = source(action.ref.id);
      // Same-container indexes are measured after taking the source entry out.
      index(action.to.index, length(container) - (previous === container ? 1 : 0));
      detach(action.ref.id);
      insert(action.ref.id, container, action.to.index);
      return;
    }
    case 'desktop.folder.remove': {
      const removed = folder(action.id);
      if (action.mode !== 'dissolve' && action.mode !== 'remove-shortcuts') {
        ctx.reject('INVALID_INPUT', { field: 'mode' });
      }
      const position = layout.root.findIndex(ref => ref.kind === 'desktop-folder' && ref.id === action.id);
      if (position < 0) ctx.reject('INVALID_REFERENCE', { id: action.id });
      for (const id of removed.shortcutIds) markShortcut(id);
      if (action.mode === 'dissolve') {
        layout.root.splice(position, 1, ...removed.shortcutIds.map(id => ({ kind: 'shortcut' as const, id })));
      } else {
        const ids = new Set(removed.shortcutIds);
        layout.root.splice(position, 1);
        layout.shortcuts = layout.shortcuts.filter(item => !ids.has(item.id));
      }
      layout.folders.splice(layout.folders.indexOf(removed), 1);
      ctx.affected.add(action.id);
      return;
    }
    case 'dock.pin': {
      bookmark(action.bookmarkId);
      index(action.index, layout.dock.length);
      const existing = layout.dock.find(item => item.bookmarkId === action.bookmarkId);
      if (existing) {
        ctx.affected.add(existing.id);
        ctx.affected.add(action.bookmarkId);
        return;
      }
      ctx.claim(action.pinId);
      layout.dock.splice(action.index, 0, { id: action.pinId, bookmarkId: action.bookmarkId });
      ctx.affected.add(action.pinId);
      ctx.affected.add(action.bookmarkId);
      return;
    }
    case 'dock.unpin': {
      bookmark(action.bookmarkId);
      const position = layout.dock.findIndex(item => item.bookmarkId === action.bookmarkId);
      if (position < 0) return;
      const [removed] = layout.dock.splice(position, 1);
      ctx.affected.add(removed.id);
      ctx.affected.add(action.bookmarkId);
      return;
    }
    case 'dock.move': {
      const position = layout.dock.findIndex(item => item.id === action.pinId);
      if (position < 0) ctx.reject('NOT_FOUND', { id: action.pinId });
      index(action.index, layout.dock.length - 1);
      const [pin] = layout.dock.splice(position, 1);
      layout.dock.splice(action.index, 0, pin);
      ctx.affected.add(pin.id);
      ctx.affected.add(pin.bookmarkId);
      return;
    }
    default:
      ctx.reject('INVALID_INPUT', { field: 'type' });
  }
}
