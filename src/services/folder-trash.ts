import type { Bookmark, Collection, Folder } from '../types';
import { readBookmarkTrash } from './bookmark-trash';
import type { DesktopLibrary } from './desktop-library';

export interface FolderTrashEntry {
  id: string;
  deletedAt: number;
  rootId: string;
  folders: Array<{ folder: Folder; index: number }>;
  bookmarks: Array<{ bookmark: Bookmark; index: number }>;
}

export function folderSubtree(library: DesktopLibrary, rootId: string): Set<string> {
  if (!library.folders.some(folder => folder.id === rootId)) throw new Error('NOT_FOUND');
  const ids = new Set([rootId]);
  for (let size = -1; size !== ids.size;) {
    size = ids.size;
    for (const folder of library.folders) if (folder.parentId && ids.has(folder.parentId)) ids.add(folder.id);
  }
  return ids;
}

export function readFolderTrash(value: unknown): FolderTrashEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('CORRUPT_DATA');
  const entryIds = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || entryIds.has(entry.id)
      || !Number.isSafeInteger(entry.deletedAt) || entry.deletedAt < 0
      || typeof entry.rootId !== 'string' || !Array.isArray(entry.folders) || !entry.folders.length
      || !Array.isArray(entry.bookmarks)) throw new Error('CORRUPT_DATA');
    entryIds.add(entry.id);
    const folderIds = new Set<string>();
    const bookmarkIds = new Set<string>();
    const indexValid = (index: unknown) => Number.isSafeInteger(index) && (index as number) >= 0;
    for (const row of entry.folders) {
      const folder = row?.folder;
      if (!indexValid(row?.index) || !folder || typeof folder.id !== 'string' || !folder.id
        || folderIds.has(folder.id) || typeof folder.name !== 'string'
        || !Number.isFinite(folder.order) || !Number.isFinite(folder.createdAt) || !Number.isFinite(folder.updatedAt)
        || (folder.parentId !== undefined && typeof folder.parentId !== 'string')
        || !Array.isArray(folder.bookmarkIds) || folder.bookmarkIds.some((id: unknown) => typeof id !== 'string')
        || new Set(folder.bookmarkIds).size !== folder.bookmarkIds.length) throw new Error('CORRUPT_DATA');
      folderIds.add(folder.id);
    }
    if (!folderIds.has(entry.rootId)) throw new Error('CORRUPT_DATA');
    for (const row of entry.bookmarks) {
      if (!indexValid(row?.index)) throw new Error('CORRUPT_DATA');
      readBookmarkTrash([{ id: 'check', deletedAt: entry.deletedAt, bookmark: row.bookmark, folderIndex: 0 }]);
      if (bookmarkIds.has(row.bookmark.id) || folderIds.has(row.bookmark.id)
        || !folderIds.has(row.bookmark.folderId)) throw new Error('CORRUPT_DATA');
      bookmarkIds.add(row.bookmark.id);
    }
    const byId = new Map<string, Folder>(entry.folders.map((row: { folder: Folder }) => [row.folder.id, row.folder]));
    for (const { folder } of entry.folders) {
      const seen = new Set<string>();
      let cursor: Folder | undefined = folder;
      while (cursor?.id !== entry.rootId) {
        if (!cursor || seen.has(cursor.id)) throw new Error('CORRUPT_DATA');
        seen.add(cursor.id);
        cursor = byId.get(cursor.parentId!);
      }
      if (folder.id === entry.rootId && folderIds.has(folder.parentId!)) throw new Error('CORRUPT_DATA');
      if (folder.bookmarkIds.some((id: string) => !bookmarkIds.has(id)
        || entry.bookmarks.find((row: { bookmark: Bookmark }) => row.bookmark.id === id)?.bookmark.folderId !== folder.id)) {
        throw new Error('CORRUPT_DATA');
      }
    }
  }
  return structuredClone(value);
}

export function detachCollectionBookmarks(collections: Collection[], ids: Set<string>): Collection[] {
  return collections.map(collection => ({
    ...collection,
    items: collection.items.map(item => ids.has(item.bookmarkId) ? { ...item, bookmarkId: '' } : item),
    ...(collection.assetContent ? { assetContent: {
      ...collection.assetContent,
      sections: collection.assetContent.sections.map(section => ({
        ...section,
        items: section.items.map(item => item.bookmarkId && ids.has(item.bookmarkId) ? { ...item, bookmarkId: null } : item),
      })),
    } } : {}),
  }));
}
