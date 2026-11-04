import type { Bookmark } from '../types';

export interface BookmarkTrashEntry {
  id: string;
  deletedAt: number;
  bookmark: Bookmark;
  folderIndex: number;
  bookmarkIndex?: number;
  batchId?: string;
}

export function readBookmarkTrash(value: unknown): BookmarkTrashEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('CORRUPT_DATA');
  const ids = new Set<string>();
  for (const item of value) {
    const bookmark = item?.bookmark;
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)
      || !Number.isSafeInteger(item.deletedAt) || item.deletedAt < 0
      || !Number.isSafeInteger(item.folderIndex) || item.folderIndex < 0
      || (item.bookmarkIndex !== undefined && (!Number.isSafeInteger(item.bookmarkIndex) || item.bookmarkIndex < 0))
      || (item.batchId !== undefined && (typeof item.batchId !== 'string' || !item.batchId))
      || !bookmark || typeof bookmark.id !== 'string' || !bookmark.id
      || typeof bookmark.title !== 'string' || typeof bookmark.url !== 'string'
      || !/^https?:\/\//i.test(bookmark.url)
      || !Number.isFinite(bookmark.order) || !Number.isFinite(bookmark.createdAt)
      || !Number.isFinite(bookmark.updatedAt)
      || (bookmark.folderId !== undefined && typeof bookmark.folderId !== 'string')
      || (bookmark.notes !== undefined && typeof bookmark.notes !== 'string')
      || (bookmark.tags !== undefined && (!Array.isArray(bookmark.tags)
        || bookmark.tags.some((word: unknown) => typeof word !== 'string')))
      || (bookmark.keywords !== undefined && (!Array.isArray(bookmark.keywords)
        || bookmark.keywords.some((word: unknown) => typeof word !== 'string')))) throw new Error('CORRUPT_DATA');
    try {
      const url = new URL(bookmark.url);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error('CORRUPT_DATA');
    } catch { throw new Error('CORRUPT_DATA'); }
    ids.add(item.id);
  }
  return structuredClone(value);
}
