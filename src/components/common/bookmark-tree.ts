import type { Bookmark, Folder } from '../../types';
import { buildFolderTree, visibleFolderRows } from './folder-tree';

export type BookmarkTreeRow = {
  key: string;
  depth: number;
  parentKey?: string;
} & (
  { kind: 'folder'; folder: Folder; expanded: boolean }
  | { kind: 'bookmark'; bookmark: Bookmark }
);

export function bookmarkTreeRows(
  folders: Folder[], bookmarks: Bookmark[], search = '', expanded?: ReadonlySet<string>,
): BookmarkTreeRow[] {
  const all = visibleFolderRows(buildFolderTree(folders), new Set(folders.map(folder => folder.id)));
  const folderIds = new Set(all.map(row => row.node.folder.id));
  const byFolder = new Map<string | undefined, Bookmark[]>();
  for (const bookmark of new Map(bookmarks.map(item => [item.id, item])).values()) {
    const parent = bookmark.folderId && folderIds.has(bookmark.folderId) ? bookmark.folderId : undefined;
    const siblings = byFolder.get(parent) ?? [];
    siblings.push(bookmark);
    byFolder.set(parent, siblings);
  }
  for (const siblings of byFolder.values()) siblings.sort((a, b) => a.order - b.order);
  const query = search.trim().toLocaleLowerCase();
  const matches = (bookmark: Bookmark, path: Folder[]) => !query || [
    bookmark.title, bookmark.url, ...(bookmark.keywords ?? []), ...path.map(folder => folder.name),
  ].some(value => value.toLocaleLowerCase().includes(query));
  const retained = new Set<string>();
  if (query) {
    for (const { node } of all) {
      if (node.path.some(folder => folder.name.toLocaleLowerCase().includes(query))
        || (byFolder.get(node.folder.id) ?? []).some(bookmark => matches(bookmark, node.path))) {
        for (const ancestor of node.path) retained.add(ancestor.id);
      }
    }
  }
  const rows: BookmarkTreeRow[] = [];
  const addBookmarks = (parentId: string | undefined, depth: number, path: Folder[]) => {
    for (const bookmark of byFolder.get(parentId) ?? []) {
      if (matches(bookmark, path)) rows.push({
        kind: 'bookmark', key: `bookmark:${bookmark.id}`, bookmark, depth,
        parentKey: parentId ? `folder:${parentId}` : undefined,
      });
    }
  };
  addBookmarks(undefined, 0, []);
  const visible = new Set<string>();
  for (const { node, depth } of all) {
    if (query && !retained.has(node.folder.id)) continue;
    if (node.parentId && !visible.has(node.parentId)) continue;
    const isExpanded = Boolean(query) || expanded === undefined || expanded.has(node.folder.id);
    rows.push({
      kind: 'folder', key: `folder:${node.folder.id}`, folder: node.folder, depth: depth - 1,
      parentKey: node.parentId ? `folder:${node.parentId}` : undefined, expanded: isExpanded,
    });
    if (isExpanded) {
      visible.add(node.folder.id);
      addBookmarks(node.folder.id, depth, node.path);
    }
  }
  return rows;
}
