import type { AssetAction } from './commands';
import type { ActionContext } from './command-context';
import type { LibraryRef, TrashEntry } from './model';
import { checkSelection, libraryContainer, libraryLocation, subtreeIds, touchParent } from './library-actions';

type TrashAction = Extract<AssetAction, { type: 'library.trash' | `trash.${string}` }>;
export function applyTrashAction(ctx: ActionContext, action: TrashAction): void {
  const snapshot = ctx.snapshot;
  if (action.type === 'library.trash') {
    checkSelection(ctx, action.refs);
    if (action.refs.length !== action.trashIds.length) ctx.reject('INVALID_INPUT');
    const plans = action.refs.map((ref, index) => {
      ctx.claim(action.trashIds[index]);
      return { ref, trashId: action.trashIds[index], origin: libraryLocation(ctx, ref), ids: subtreeIds(ctx, ref) };
    });
    const removedBookmarks = new Set<string>();
    for (const plan of plans) {
      const { ref, ids } = plan;
      const current = libraryLocation(ctx, ref);
      libraryContainer(ctx, current.parentId).splice(current.index, 1);
      const bookmarks = snapshot.library.bookmarks.filter((item) => ids.has(item.id));
      bookmarks.forEach((item) => removedBookmarks.add(item.id));
      const entry: TrashEntry = {
        id: plan.trashId, deletedAt: ctx.at, origin: plan.origin,
        payload: ref.kind === 'bookmark'
          ? { kind: 'bookmark', bookmark: bookmarks[0] }
          : { kind: 'folder-tree', rootFolderId: ref.id, library: {
            bookmarks, folders: snapshot.library.folders.filter((item) => ids.has(item.id)),
            root: [{ ...ref }],
          } },
      };
      snapshot.library.bookmarks = snapshot.library.bookmarks.filter((item) => !ids.has(item.id));
      snapshot.library.folders = snapshot.library.folders.filter((item) => !ids.has(item.id));
      snapshot.trash.push(entry);
      for (const id of ids) ctx.affected.add(id);
      ctx.affected.add(plan.trashId);
      touchParent(ctx, current.parentId);
    }
    const removedShortcuts = new Set(snapshot.layout.shortcuts.filter((item) => removedBookmarks.has(item.bookmarkId)).map((item) => item.id));
    snapshot.layout.shortcuts = snapshot.layout.shortcuts.filter((item) => !removedShortcuts.has(item.id));
    snapshot.layout.root = snapshot.layout.root.filter((ref) => !removedShortcuts.has(ref.id));
    for (const folder of snapshot.layout.folders) {
      const next = folder.shortcutIds.filter((id) => !removedShortcuts.has(id));
      if (next.length !== folder.shortcutIds.length) ctx.affected.add(folder.id);
      folder.shortcutIds = next;
    }
    for (const pin of snapshot.layout.dock) if (removedBookmarks.has(pin.bookmarkId)) ctx.affected.add(pin.id);
    snapshot.layout.dock = snapshot.layout.dock.filter((pin) => !removedBookmarks.has(pin.bookmarkId));
    removedShortcuts.forEach((id) => ctx.affected.add(id));
    const collections = [
      ...snapshot.collections,
      ...snapshot.trash.flatMap((entry) => entry.payload.kind === 'collection' ? [entry.payload.collection] : []),
    ];
    for (const collection of collections) {
      for (const section of collection.sections) for (const item of section.items) {
        if (item.bookmarkId !== null && removedBookmarks.has(item.bookmarkId)) {
          item.bookmarkId = null;
          ctx.affected.add(item.id);
        }
      }
    }
    return;
  }

  if (!action.ids.length || new Set(action.ids).size !== action.ids.length) ctx.reject('INVALID_INPUT');
  const entries = action.ids.map((id) => {
    const entry = snapshot.trash.find((item) => item.id === id);
    if (!entry) ctx.reject('NOT_FOUND', { id });
    return entry;
  });
  if (action.type === 'trash.purge') {
    snapshot.trash = snapshot.trash.filter((entry) => !action.ids.includes(entry.id));
    action.ids.forEach((id) => ctx.affected.add(id));
    return;
  }

  // Restore selected parent subtrees before children deleted in earlier batches.
  const pending = [...entries].sort((a, b) => {
    const position = (entry: TrashEntry) => entry.payload.kind === 'collection' ? entry.payload.index : entry.origin!.index;
    return position(a) - position(b);
  });
  while (pending.length) {
    const index = pending.findIndex((entry) => entry.origin?.parentId == null
      || !pending.some((other) => other !== entry && other.payload.kind === 'folder-tree'
        && other.payload.library.folders.some((folder) => folder.id === entry.origin!.parentId)));
    if (index < 0) ctx.reject('CYCLE', { reason: 'trash-parent-cycle' });
    const entry = pending.splice(index, 1)[0];
    if (entry.payload.kind === 'collection') {
      snapshot.collections.splice(Math.min(entry.payload.index, snapshot.collections.length), 0, entry.payload.collection);
      ctx.affected.add(entry.payload.collection.id);
    } else {
      const parentId = entry.origin!.parentId;
      const targetId = parentId !== null && snapshot.library.folders.some((item) => item.id === parentId) ? parentId : null;
      const target = libraryContainer(ctx, targetId);
      let ref: LibraryRef;
      if (entry.payload.kind === 'bookmark') {
        snapshot.library.bookmarks.push(entry.payload.bookmark);
        ref = { kind: 'bookmark', id: entry.payload.bookmark.id };
      } else {
        snapshot.library.bookmarks.push(...entry.payload.library.bookmarks);
        snapshot.library.folders.push(...entry.payload.library.folders);
        ref = { kind: 'folder', id: entry.payload.rootFolderId };
      }
      target.splice(Math.min(entry.origin!.index, target.length), 0, ref);
      ctx.affected.add(ref.id);
      touchParent(ctx, targetId);
    }
    snapshot.trash = snapshot.trash.filter((item) => item.id !== entry.id);
    ctx.affected.add(entry.id);
  }
}
