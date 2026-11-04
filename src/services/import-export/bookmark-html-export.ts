import type { Bookmark, Folder } from '../../types';
import { normalizeBookmarkUrl } from '../bookmark-input';

type Entry = { kind: 'bookmark'; value: Bookmark } | { kind: 'folder'; value: Folder };
const entities: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => entities[character]);
}

function seconds(timestamp: number): number {
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor(timestamp / 1000)) : 0;
}

export function exportBookmarkHtml(bookmarks: Bookmark[], folders: Folder[]): string {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const parents = new Map([...byId.values()].map(folder => [
    folder.id, folder.parentId !== undefined && byId.has(folder.parentId) ? folder.parentId : undefined,
  ]));

  // Break one edge per cycle without changing the persisted archive or losing its descendants.
  const settled = new Set<string>();
  for (const folder of byId.values()) {
    const chain = new Set<string>();
    let id: string | undefined = folder.id;
    while (id !== undefined && !settled.has(id)) {
      chain.add(id);
      const parent = parents.get(id);
      if (parent !== undefined && chain.has(parent)) {
        parents.set(id, undefined);
        break;
      }
      id = parent;
    }
    for (const visited of chain) settled.add(visited);
  }

  const children = new Map<string | undefined, Entry[]>();
  function append(parentId: string | undefined, entry: Entry): void {
    const siblings = children.get(parentId) ?? [];
    siblings.push(entry);
    children.set(parentId, siblings);
  }
  // folderId is the archive location; stale bookmarkIds must not duplicate or hide bookmarks.
  for (const bookmark of bookmarks) {
    try {
      if (!/^https?:\/\//i.test(bookmark.url)) throw new Error('INVALID_EXPORT_URL');
      normalizeBookmarkUrl(bookmark.url);
    } catch {
      throw new Error('INVALID_EXPORT_URL');
    }
    const parent = bookmark.folderId !== undefined && byId.has(bookmark.folderId)
      ? bookmark.folderId : undefined;
    append(parent, { kind: 'bookmark', value: bookmark });
  }
  for (const folder of byId.values()) append(parents.get(folder.id), { kind: 'folder', value: folder });
  for (const siblings of children.values()) siblings.sort((left, right) => left.value.order - right.value.order);

  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>JIGEQIU Bookmarks</TITLE>',
    '<H1>JIGEQIU Bookmarks</H1>',
    '<DL><p>',
  ];
  const stack: (Entry | { kind: 'close' })[] = [...(children.get(undefined) ?? [])].reverse();
  while (stack.length) {
    const entry = stack.pop()!;
    if (entry.kind === 'close') {
      lines.push('</DL><p>', '</DT>');
    } else if (entry.kind === 'bookmark') {
      const bookmark = entry.value;
      lines.push(`<DT><A HREF="${escapeHtml(bookmark.url)}" ADD_DATE="${seconds(bookmark.createdAt)}">${escapeHtml(bookmark.title)}</A></DT>`);
    } else {
      const folder = entry.value;
      lines.push(`<DT><H3 ADD_DATE="${seconds(folder.createdAt)}" LAST_MODIFIED="${seconds(folder.updatedAt)}">${escapeHtml(folder.name)}</H3>`, '<DL><p>');
      stack.push({ kind: 'close' });
      const entries = children.get(folder.id) ?? [];
      for (let index = entries.length - 1; index >= 0; index--) stack.push(entries[index]);
    }
  }
  lines.push('</DL><p>');
  return lines.join('\n');
}
