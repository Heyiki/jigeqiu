import type { Folder } from '../../types';

export interface FolderTreeNode {
  folder: Folder;
  parentId?: string;
  path: Folder[];
  children: FolderTreeNode[];
}

export interface FolderTreeRow {
  node: FolderTreeNode;
  depth: number;
  expanded: boolean;
}

export function buildFolderTree(folders: Folder[], excludedIds: string[] = []): FolderTreeNode[] {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const children = new Map<string, string[]>();
  for (const folder of byId.values()) {
    if (folder.parentId !== undefined) {
      const siblings = children.get(folder.parentId) ?? [];
      siblings.push(folder.id);
      children.set(folder.parentId, siblings);
    }
  }
  // Exclude using the original edges, before repairing cycles or missing parents.
  const excluded = new Set(excludedIds);
  const pending = [...excluded];
  while (pending.length) {
    for (const id of children.get(pending.pop()!) ?? []) {
      if (!excluded.has(id)) { excluded.add(id); pending.push(id); }
    }
  }
  const nodes = new Map<string, FolderTreeNode>();
  for (const folder of byId.values()) {
    if (!excluded.has(folder.id)) nodes.set(folder.id, {
      folder, parentId: folder.parentId, path: [], children: [],
    });
  }
  const visited = new Set<string>();
  for (const node of nodes.values()) {
    const chain = new Set<string>();
    let current: FolderTreeNode | undefined = node;
    while (current && !visited.has(current.folder.id)) {
      chain.add(current.folder.id);
      const parent: FolderTreeNode | undefined = current.parentId === undefined ? undefined : nodes.get(current.parentId);
      if (!parent || chain.has(parent.folder.id)) {
        current.parentId = undefined;
        break;
      }
      current = parent;
    }
    for (const id of chain) visited.add(id);
  }
  const roots: FolderTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId === undefined ? undefined : nodes.get(node.parentId);
    (parent ? parent.children : roots).push(node);
  }
  const sort = (items: FolderTreeNode[]) => items.sort((a, b) => a.folder.order - b.folder.order);
  sort(roots);
  const stack = [...roots].reverse();
  while (stack.length) {
    const node = stack.pop()!;
    const parent = node.parentId === undefined ? undefined : nodes.get(node.parentId);
    node.path = [...(parent?.path ?? []), node.folder];
    sort(node.children);
    for (let index = node.children.length - 1; index >= 0; index--) stack.push(node.children[index]);
  }
  return roots;
}

export function visibleFolderRows(
  tree: FolderTreeNode[], expandedIds: ReadonlySet<string>, search = '',
): FolderTreeRow[] {
  const query = search.trim().toLocaleLowerCase();
  const retained = new Set<string>();
  const all = [...tree];
  for (let index = 0; index < all.length; index++) {
    const node = all[index];
    for (const child of node.children) all.push(child);
    if (query && node.folder.name.toLocaleLowerCase().includes(query)) {
      for (const ancestor of node.path) retained.add(ancestor.id);
    }
  }
  const rows: FolderTreeRow[] = [];
  const stack = [...tree].reverse();
  while (stack.length) {
    const node = stack.pop()!;
    if (query && !retained.has(node.folder.id)) continue;
    const expanded = node.children.length > 0 && (Boolean(query) || expandedIds.has(node.folder.id));
    rows.push({ node, depth: node.path.length, expanded });
    if (expanded) {
      for (let index = node.children.length - 1; index >= 0; index--) stack.push(node.children[index]);
    }
  }
  return rows;
}

export function indexFolderPaths(folders: Folder[]): Map<string, Folder[]> {
  const rows = visibleFolderRows(buildFolderTree(folders), new Set(folders.map(folder => folder.id)));
  return new Map(rows.map(row => [row.node.folder.id, row.node.path]));
}

export function bookmarkLibraryPath(folders: Folder[], folderId?: string, english = false): string {
  const path = folderId ? indexFolderPaths(folders).get(folderId) : undefined;
  const root = english ? 'All bookmarks' : '全部收藏';
  const fallback = folderId ? (english ? 'Original folder missing' : '原文件夹不存在') : (english ? 'Unorganized' : '未整理');
  return `${root} / ${path?.map(folder => folder.name).join(' / ') || fallback}`;
}

export function navigateFolderTree(
  rows: FolderTreeRow[], activeId: string | undefined, expanded: ReadonlySet<string>, key: string,
): { activeId: string | undefined; expandedIds: Set<string>; select: boolean } {
  const expandedIds = new Set(expanded);
  const ids = [undefined, ...rows.map(row => row.node.folder.id)];
  const index = Math.max(0, ids.indexOf(activeId));
  const row = rows.find(item => item.node.folder.id === activeId);
  let next = ids[index];
  if (key === 'ArrowDown') next = ids[Math.min(ids.length - 1, index + 1)];
  if (key === 'ArrowUp') next = ids[Math.max(0, index - 1)];
  if (key === 'Home') next = undefined;
  if (key === 'End') next = ids.at(-1);
  if (key === 'ArrowRight') {
    if (activeId === undefined) next = ids[1];
    else if (row?.node.children.length) {
      if (row.expanded) {
        const child = rows[index];
        if (child?.node.parentId === activeId) next = child.node.folder.id;
      }
      else expandedIds.add(activeId);
    }
  }
  if (key === 'ArrowLeft' && row) {
    if (row.expanded) expandedIds.delete(row.node.folder.id);
    else next = row.node.parentId;
  }
  return { activeId: next, expandedIds, select: key === 'Enter' || key === ' ' };
}
