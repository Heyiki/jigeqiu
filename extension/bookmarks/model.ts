import type { Bookmark, Folder } from '../../src/types';
import type { DesktopLibrary } from '../../src/services/desktop-library';
import { reconcileDesktopLayout } from '../../src/services/desktop-library';
import type { Layout } from '../../src/domain/assets/model';

export interface NativeBookmark {
  id: string;
  title: string;
  url?: string;
  children?: NativeBookmark[];
  dateAdded?: number;
  folderType?: string;
  syncing?: boolean;
  unmodifiable?: string;
}
export interface BookmarksAPI {
  getTree(): Promise<NativeBookmark[]>;
  create(details: { parentId: string; title: string; url?: string; index?: number }): Promise<NativeBookmark>;
  update(id: string, changes: { title?: string; url?: string }): Promise<NativeBookmark>;
  move(id: string, destination: { parentId: string; index?: number }): Promise<NativeBookmark>;
  remove(id: string): Promise<void>;
}
export interface BrowserLibrary extends DesktopLibrary {
  version: 1;
  desktopLayout?: Layout;
  [key: string]: unknown;
}
export interface BrowserBookmarkState {
  ids: Record<string, string>;
  library: BrowserLibrary;
}
export interface BarSnapshot { root: NativeBookmark; signature: string }
export interface BrowserBookmarkCommit extends BrowserBookmarkState { snapshot: BarSnapshot }

function fingerprint(node: NativeBookmark): unknown[] {
  return [node.id, node.title, node.url ?? null, node.unmodifiable ?? null,
    (node.children ?? []).map(fingerprint)];
}

export async function readBookmarkBar(api: BookmarksAPI, rootId?: string): Promise<BarSnapshot> {
  const roots = (await api.getTree())[0]?.children ?? [];
  const bars = roots.filter(node => node.folderType === 'bookmarks-bar');
  // Chromium before folderType used the permanent bookmark bar ID "1".
  const root = rootId ? roots.find(node => node.id === rootId)
    : bars.find(node => node.syncing) ?? bars[0] ?? roots.find(node => node.id === '1');
  if (!root || root.url !== undefined || root.unmodifiable
    || (root.folderType !== undefined ? root.folderType !== 'bookmarks-bar' : root.id !== '1')) throw new Error('BOOKMARK_BAR_UNAVAILABLE');
  return { root, signature: JSON.stringify(fingerprint(root)) };
}

export function projectBookmarkBar(snapshot: BarSnapshot, previous?: BrowserBookmarkState): BrowserBookmarkState {
  const aliases = new Map(Object.entries(previous?.ids ?? {}).map(([id, nativeId]) => [nativeId, id]));
  const oldBookmarks = new Map(previous?.library.bookmarks.map(item => [item.id, item]) ?? []);
  const oldFolders = new Map(previous?.library.folders.map(item => [item.id, item]) ?? []);
  const ids: Record<string, string> = {};
  const bookmarks: Bookmark[] = [];
  const folders: Folder[] = [];
  const walk = (node: NativeBookmark, parentId?: string) => {
    for (const [order, child] of (node.children ?? []).entries()) {
      const id = aliases.get(child.id) ?? `browser-${child.id}`;
      ids[id] = child.id;
      const createdAt = child.dateAdded ?? 0;
      if (child.url !== undefined) {
        let domain = '';
        try { domain = new URL(child.url).hostname.replace(/^www\./, ''); } catch { /* Bookmarklets have no hostname. */ }
        bookmarks.push({
          category: 'cat-inbox', collectionIds: [], pinnedToDesktop: false,
          createdAt, updatedAt: createdAt, ...oldBookmarks.get(id),
          id, title: child.title, url: child.url, domain, folderId: parentId, order,
        });
      } else {
        const folder: Folder = {
          pinnedToDesktop: false, createdAt, updatedAt: createdAt, ...oldFolders.get(id),
          id, name: child.title, parentId, order, bookmarkIds: [],
        };
        folders.push(folder);
        walk(child, id);
        folder.bookmarkIds = bookmarks.filter(item => item.folderId === id).map(item => item.id);
      }
    }
  };
  walk(snapshot.root);
  const library: BrowserLibrary = { ...previous?.library, version: 1, bookmarks, folders };
  if (previous?.library.desktopLayout) {
    library.desktopLayout = reconcileDesktopLayout(previous.library, library, previous.library.desktopLayout);
  }
  if (Array.isArray(library.dockBookmarkIds)) {
    library.dockBookmarkIds = library.dockBookmarkIds.filter(id => bookmarks.some(bookmark => bookmark.id === id));
  }
  return { ids, library };
}

function core(library: DesktopLibrary): string {
  return JSON.stringify([
    library.bookmarks.map(b => [b.id, b.title, b.url, b.folderId ?? null, b.order]),
    library.folders.map(f => [f.id, f.name, f.parentId ?? null, f.order, f.bookmarkIds]),
  ]);
}

/** Writes only known nodes. Empty-folder removal protects children created outside the app. */
export async function commitBookmarkBar(
  api: BookmarksAPI, expected: BarSnapshot, previous: BrowserBookmarkState, desired: BrowserLibrary,
): Promise<BrowserBookmarkCommit> {
  const fresh = await readBookmarkBar(api, expected.root.id);
  if (fresh.signature !== expected.signature) throw new Error('CONFLICT');
  if (core(previous.library) === core(desired)) return { ids: { ...previous.ids }, library: desired, snapshot: fresh };
  const all = [...desired.folders, ...desired.bookmarks];
  if (new Set(all.map(item => item.id)).size !== all.length) throw new Error('INVALID_REFERENCE');
  const folders = new Map(desired.folders.map(folder => [folder.id, folder]));
  const checked = new Set<string>();
  const validate = (id: string, path = new Set<string>()) => {
    if (checked.has(id)) return;
    const folder = folders.get(id);
    if (!folder || path.has(id)) throw new Error('INVALID_REFERENCE');
    if (folder.parentId) validate(folder.parentId, new Set([...path, id]));
    checked.add(id);
  };
  desired.folders.forEach(folder => validate(folder.id));
  desired.bookmarks.forEach(bookmark => { if (bookmark.folderId && !folders.has(bookmark.folderId)) throw new Error('INVALID_REFERENCE'); });
  const ids = { ...previous.ids };
  const oldBookmarks = new Map(previous.library.bookmarks.map(item => [item.id, item]));
  const oldFolders = new Map(previous.library.folders.map(item => [item.id, item]));
  const retained = new Set(all.map(item => item.id));
  const created = new Set<string>();
  let touched = false;
  const write = async <T>(operation: () => Promise<T>): Promise<T> => { touched = true; return operation(); };
  try {
    const ensureFolder = async (id: string): Promise<string> => {
      if (ids[id]) return ids[id];
      const folder = folders.get(id)!;
      const parentId = folder.parentId ? await ensureFolder(folder.parentId) : expected.root.id;
      const node = await write(() => api.create({ parentId, title: folder.name }));
      ids[id] = node.id;
      created.add(id);
      return node.id;
    };
    for (const folder of desired.folders) await ensureFolder(folder.id);
    for (const bookmark of desired.bookmarks) {
      const parentId = bookmark.folderId ? ids[bookmark.folderId] : expected.root.id;
      const old = oldBookmarks.get(bookmark.id);
      if (!ids[bookmark.id]) {
        const node = await write(() => api.create({ parentId, title: bookmark.title, url: bookmark.url }));
        ids[bookmark.id] = node.id;
        created.add(bookmark.id);
      } else if (old && (old.title !== bookmark.title || old.url !== bookmark.url)) {
        await write(() => api.update(ids[bookmark.id], { title: bookmark.title, url: bookmark.url }));
      }
    }
    for (const folder of desired.folders) {
      if (oldFolders.has(folder.id) && oldFolders.get(folder.id)!.name !== folder.name) {
        await write(() => api.update(ids[folder.id], { title: folder.name }));
      }
    }
    // Move parents before children; the final graph was checked for cycles above.
    const moved = new Set<string>();
    const moveFolder = async (folder: Folder): Promise<void> => {
      if (moved.has(folder.id)) return;
      if (folder.parentId) await moveFolder(folders.get(folder.parentId)!);
      if (!created.has(folder.id) && oldFolders.get(folder.id)?.parentId !== folder.parentId) {
        await write(() => api.move(ids[folder.id], { parentId: folder.parentId ? ids[folder.parentId] : expected.root.id }));
      }
      moved.add(folder.id);
    };
    for (const folder of desired.folders) await moveFolder(folder);
    for (const bookmark of desired.bookmarks) {
      if (!created.has(bookmark.id) && oldBookmarks.get(bookmark.id)?.folderId !== bookmark.folderId) {
        await write(() => api.move(ids[bookmark.id], { parentId: bookmark.folderId ? ids[bookmark.folderId] : expected.root.id }));
      }
    }
    for (const bookmark of previous.library.bookmarks) {
      if (!retained.has(bookmark.id)) { await write(() => api.remove(ids[bookmark.id])); delete ids[bookmark.id]; }
    }
    const removed = previous.library.folders.filter(folder => !retained.has(folder.id));
    const removeFolder = async (folder: Folder): Promise<void> => {
      for (const child of removed.filter(item => item.parentId === folder.id)) await removeFolder(child);
      if (ids[folder.id]) { await write(() => api.remove(ids[folder.id])); delete ids[folder.id]; }
    };
    for (const folder of removed) await removeFolder(folder);
    // Reorder only when the requested sibling order differs from the actual tree.
    const actual = await readBookmarkBar(api, expected.root.id);
    const nativeNodes = new Map<string, NativeBookmark>();
    const index = (node: NativeBookmark) => { nativeNodes.set(node.id, node); node.children?.forEach(index); };
    index(actual.root);
    for (const parentId of [undefined, ...desired.folders.map(folder => folder.id)]) {
      const children = [
        ...desired.folders.filter(f => f.parentId === parentId).map(f => ({ id: f.id, order: f.order })),
        ...desired.bookmarks.filter(b => b.folderId === parentId).map(b => ({ id: b.id, order: b.order })),
      ].sort((a, b) => a.order - b.order);
      const nativeParent = parentId ? ids[parentId] : expected.root.id;
      const current = nativeNodes.get(nativeParent)?.children?.map(child => child.id) ?? [];
      for (const [position, child] of children.entries()) {
        if (current[position] === ids[child.id]) continue;
        await write(() => api.move(ids[child.id], { parentId: nativeParent, index: position }));
        const from = current.indexOf(ids[child.id]);
        if (from >= 0) current.splice(from, 1);
        current.splice(position, 0, ids[child.id]);
      }
    }
    const confirmed = await readBookmarkBar(api, expected.root.id);
    const result = projectBookmarkBar(confirmed, { ids, library: desired });
    // Other applications may change bookmarks during this non-transactional API sequence.
    if (result.library.bookmarks.length !== desired.bookmarks.length || result.library.folders.length !== desired.folders.length
      || desired.bookmarks.some(b => !result.library.bookmarks.some(n => n.id === b.id && n.title === b.title && n.url === b.url && n.folderId === b.folderId))
      || desired.folders.some(f => !result.library.folders.some(n => n.id === f.id && n.name === f.name && n.parentId === f.parentId))) {
      throw new Error('COMMIT_UNCERTAIN');
    }
    // Preserve the just-committed app snapshot/baselines until the next refresh.
    return { ids: result.ids, library: desired, snapshot: confirmed };
  } catch (cause) {
    if (touched) throw new Error('COMMIT_UNCERTAIN', { cause });
    throw cause;
  }
}
