import type { Bookmark, Folder } from '../../types';
import type { Result } from '../../domain/assets/model';
import type { ImportNode } from './model';
import { parseHtml } from './html';
import { extractDomain, getDomainColor } from '../storage';

export interface PrototypeLibrary { bookmarks: Bookmark[]; folders: Folder[] }
export interface ChromeLibraryPreview {
  base: PrototypeLibrary;
  library: PrototypeLibrary;
  counts: { bookmarks: number; folders: number; skipped: number; invalid: number };
}

/** Temporary boundary into the existing desktop model, not a second bookmark store. */
export function prepareChromeLibraryImport(
  html: string, current: PrototypeLibrary, newId: () => string, at: number,
): Result<ChromeLibraryPreview> {
  const parsed = parseHtml(html);
  if (!parsed.ok) return parsed;
  const library = structuredClone(current);
  const counts = {
    bookmarks: 0, folders: 0, skipped: 0,
    invalid: parsed.value.notices.filter(notice => notice.code === 'INVALID_HTML_BOOKMARK').length,
  };
  const seen = new Set(library.bookmarks.map(item => `${item.folderId ?? ''}\n${new URL(item.url).href}`));
  const ids = new Set([...library.bookmarks, ...library.folders].map(item => item.id));
  const allocate = () => {
    const id = newId();
    if (!id || ids.has(id)) throw new Error('ID_COLLISION');
    ids.add(id);
    return id;
  };
  const walk = (nodes: ImportNode[], parentId?: string) => nodes.forEach(node => {
    if (node.kind === 'folder') {
      const folder: Folder = {
        id: allocate(), name: node.name, ...(parentId ? { parentId } : {}), bookmarkIds: [],
        pinnedToDesktop: false, order: library.folders.length + 1, createdAt: at, updatedAt: at,
      };
      library.folders.push(folder);
      counts.folders++;
      walk(node.children, folder.id);
    } else {
      const url = new URL(node.input.url).href;
      const key = `${parentId ?? ''}\n${url}`;
      if (seen.has(key)) { counts.skipped++; return; }
      seen.add(key);
      const domain = extractDomain(url);
      const bookmark: Bookmark = {
        id: allocate(), title: node.input.title, url, domain,
        iconBg: getDomainColor(domain), category: 'cat-inbox', tags: [],
        notes: '', ...(parentId ? { folderId: parentId } : {}), pinnedToDesktop: false,
        order: library.bookmarks.length + 1, collectionIds: [], createdAt: at, updatedAt: at,
      };
      library.bookmarks.push(bookmark);
      if (parentId) library.folders.find(folder => folder.id === parentId)!.bookmarkIds.push(bookmark.id);
      counts.bookmarks++;
    }
  });
  try {
    walk(parsed.value.roots);
    return { ok: true, value: { base: structuredClone(current), library, counts } };
  } catch {
    return { ok: false, error: { code: 'IMPORT_INVALID', details: {} } };
  }
}
