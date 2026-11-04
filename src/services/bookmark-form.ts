import type { Bookmark, SiteIconMode } from '../types';
import { normalizeBookmarkUrl, parseBookmarkKeywords } from './bookmark-input';

export interface BookmarkFormDraft {
  title: string;
  url: string;
  folderId?: string;
  keywords: string[];
  icon?: string;
  iconMode: SiteIconMode;
}

export function bookmarkFormInput(
  draft: BookmarkFormDraft,
  options: { bookmark?: Bookmark; pinToDesktop?: boolean; order?: number } = {},
): Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'> {
  const previous = options.bookmark;
  const url = normalizeBookmarkUrl(draft.url);
  return {
    category: 'cat-inbox', collectionIds: [], order: options.order ?? 0,
    pinnedToDesktop: options.pinToDesktop ?? false,
    ...previous,
    title: draft.title.trim(), url, domain: new URL(url).hostname.replace(/^www\./, ''),
    folderId: draft.folderId,
    keywords: parseBookmarkKeywords(draft.keywords.join(',')),
    icon: draft.icon,
    iconMode: draft.iconMode,
  };
}

export function defaultBookmarkTitle(input: string): string {
  try {
    const domain = new URL(normalizeBookmarkUrl(input)).hostname.replace(/^www\./, '');
    const name = domain.split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch { return ''; }
}

export function findDuplicateBookmark(bookmarks: Bookmark[], input: string, existingId?: string): Bookmark | undefined {
  try {
    const url = normalizeBookmarkUrl(input);
    return bookmarks.find(bookmark => {
      if (bookmark.id === existingId) return false;
      try { return normalizeBookmarkUrl(bookmark.url) === url; }
      catch { return false; }
    });
  } catch { return undefined; }
}
