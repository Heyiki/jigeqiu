import type { AssetAction, BookmarkInput } from './commands';
import type { ActionContext } from './command-context';
import type { LibraryPlacement, LibraryRef } from './model';
import { applyLayoutAction } from './layout-actions';

export function libraryContainer(ctx: ActionContext, parentId: string | null): LibraryRef[] {
  if (parentId === null) return ctx.snapshot.library.root;
  const folder = ctx.snapshot.library.folders.find((item) => item.id === parentId);
  if (!folder) ctx.reject('INVALID_REFERENCE', { parentId });
  return folder.children;
}
export function libraryLocation(ctx: ActionContext, ref: LibraryRef): LibraryPlacement {
  const library = ctx.snapshot.library;
  for (const [parentId, refs] of [
    [null, library.root], ...library.folders.map((folder) => [folder.id, folder.children]),
  ] as [string | null, LibraryRef[]][]) {
    const index = refs.findIndex((item) => item.kind === ref.kind && item.id === ref.id);
    if (index >= 0) return { parentId, index };
  }
  return ctx.reject('NOT_FOUND', { id: ref.id });
}
export function subtreeIds(ctx: ActionContext, ref: LibraryRef): Set<string> {
  libraryLocation(ctx, ref);
  const ids = new Set<string>();
  function visit(item: LibraryRef): void {
    ids.add(item.id);
    if (item.kind === 'folder') {
      const folder = ctx.snapshot.library.folders.find((folder) => folder.id === item.id)!;
      folder.children.forEach(visit);
    }
  }
  visit(ref);
  return ids;
}
export function checkSelection(ctx: ActionContext, refs: LibraryRef[]): void {
  if (!refs.length) ctx.reject('INVALID_INPUT');
  const included = new Set<string>();
  for (const ref of refs) {
    for (const id of subtreeIds(ctx, ref)) {
      if (included.has(id)) ctx.reject('INVALID_INPUT', { reason: 'overlapping-selection' });
      included.add(id);
    }
  }
}
export function insertAt<T>(ctx: ActionContext, items: T[], index: number, additions: T[]): void {
  if (!Number.isSafeInteger(index) || index < 0 || index > items.length) ctx.reject('INVALID_INPUT', { reason: 'insertion-index' });
  items.splice(index, 0, ...additions);
}
export function touchParent(ctx: ActionContext, parentId: string | null): void {
  if (parentId !== null) {
    const folder = ctx.snapshot.library.folders.find((item) => item.id === parentId);
    if (folder) { folder.updatedAt = ctx.at; ctx.affected.add(parentId); }
  }
}
function normalizedInput(ctx: ActionContext, input: BookmarkInput): BookmarkInput {
  let url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) {
    if (/^[a-z][a-z\d+.-]*:/i.test(url) && !/^[^/:?#]+:\d+(?:[/?#]|$)/.test(url)) ctx.reject('INVALID_URL');
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) ctx.reject('INVALID_URL');
  } catch { ctx.reject('INVALID_URL'); }
  return { ...input, url, keywords: [...new Set(input.keywords.map((word) => word.trim()).filter(Boolean))] };
}
function checkDuplicate(ctx: ActionContext, url: string, parentId: string | null, exclude?: string): void {
  const ids = new Set(libraryContainer(ctx, parentId).filter((item) => item.kind === 'bookmark').map((item) => item.id));
  const key = new URL(url).href;
  const matches = ctx.snapshot.library.bookmarks.filter((item) => item.id !== exclude && ids.has(item.id) && new URL(item.url).href === key);
  if (matches.length) ctx.reject('DUPLICATE_REQUIRES_DECISION', { ids: matches.map((item) => item.id) });
}
type LibraryAction = Extract<AssetAction, { type: `bookmark.${string}` | `library.${string}` }>;
export function applyLibraryAction(ctx: ActionContext, action: Exclude<LibraryAction, { type: 'library.trash' }>): void {
  const library = ctx.snapshot.library;
  switch (action.type) {
    case 'bookmark.create': {
      const input = normalizedInput(ctx, action.input);
      const target = libraryContainer(ctx, action.to.parentId);
      if (action.duplicates === 'reject') checkDuplicate(ctx, input.url, action.to.parentId);
      ctx.claim(action.id);
      library.bookmarks.push({ ...input, id: action.id, createdAt: ctx.at, updatedAt: ctx.at });
      insertAt(ctx, target, action.to.index, [{ kind: 'bookmark', id: action.id }]);
      touchParent(ctx, action.to.parentId);
      if (action.desktop) applyLayoutAction(ctx, {
        type: 'desktop.pin', bookmarkId: action.id, shortcutId: action.desktop.shortcutId, to: action.desktop.to,
      });
      break;
    }
    case 'bookmark.update': {
      const bookmark = library.bookmarks.find((item) => item.id === action.id);
      if (!bookmark) ctx.reject('NOT_FOUND', { id: action.id });
      const input = normalizedInput(ctx, action.input);
      if (action.duplicates === 'reject') {
        checkDuplicate(ctx, input.url, libraryLocation(ctx, { kind: 'bookmark', id: action.id }).parentId, action.id);
      }
      Object.assign(bookmark, input, { updatedAt: ctx.at });
      break;
    }
    case 'library.folder.create': {
      const target = libraryContainer(ctx, action.to.parentId);
      ctx.claim(action.id);
      library.folders.push({ id: action.id, name: action.name, children: [], createdAt: ctx.at, updatedAt: ctx.at });
      insertAt(ctx, target, action.to.index, [{ kind: 'folder', id: action.id }]);
      touchParent(ctx, action.to.parentId);
      break;
    }
    case 'library.folder.rename': {
      const folder = library.folders.find((item) => item.id === action.id);
      if (!folder) ctx.reject('NOT_FOUND', { id: action.id });
      folder.name = action.name;
      folder.updatedAt = ctx.at;
      break;
    }
    case 'library.move': {
      checkSelection(ctx, action.refs);
      const target = libraryContainer(ctx, action.to.parentId);
      for (const ref of action.refs) {
        if (action.to.parentId !== null && subtreeIds(ctx, ref).has(action.to.parentId)) ctx.reject('CYCLE');
      }
      for (const ref of action.refs) {
        const location = libraryLocation(ctx, ref);
        libraryContainer(ctx, location.parentId).splice(location.index, 1);
        touchParent(ctx, location.parentId);
        ctx.affected.add(ref.id);
      }
      insertAt(ctx, target, action.to.index, action.refs);
      touchParent(ctx, action.to.parentId);
      break;
    }
    case 'library.folder.dissolve': {
      const folder = library.folders.find((item) => item.id === action.id);
      if (!folder) ctx.reject('NOT_FOUND', { id: action.id });
      const location = libraryLocation(ctx, { kind: 'folder', id: action.id });
      libraryContainer(ctx, location.parentId).splice(location.index, 1, ...folder.children);
      library.folders = library.folders.filter((item) => item.id !== action.id);
      folder.children.forEach((ref) => ctx.affected.add(ref.id));
      touchParent(ctx, location.parentId);
      break;
    }
  }
  if ('id' in action) ctx.affected.add(action.id);
}
