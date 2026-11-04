import type { Bookmark, Collection } from '../types';
import type { CollectionItem, CollectionSection, Icon } from '../domain/assets/model';
import { ASSET_LIMITS, validateSnapshot } from '../domain/assets/validation';
import { prototypeAssetSnapshot } from './import-export/prototype-json';
import { exportAssets } from './import-export/exchange';

const newId = () => crypto.randomUUID();

function sameIconUrl(left: string, right?: string): boolean {
  try { return !!right && new URL(left).href === new URL(right).href; } catch { return false; }
}

function snapshotIcon(bookmark: Pick<Bookmark, 'title' | 'icon' | 'iconMode' | 'assetIcon'>): Icon | null {
  if (bookmark.assetIcon && (bookmark.iconMode === 'text' && bookmark.assetIcon.kind === 'monogram'
    || bookmark.assetIcon.kind === 'url' && sameIconUrl(bookmark.assetIcon.value, bookmark.icon)
      && (bookmark.assetIcon.mode ?? 'custom') === bookmark.iconMode)) return structuredClone(bookmark.assetIcon);
  if (bookmark.iconMode === 'text') return { kind: 'monogram', value: bookmark.title.slice(0, 2) || '?', color: null };
  return bookmark.icon ? { kind: 'url', value: bookmark.icon, color: null,
    ...(bookmark.iconMode === 'auto' || bookmark.iconMode === 'custom' ? { mode: bookmark.iconMode } : {}) } : null;
}

export function bookmarkCollectionItem(bookmark: Bookmark): CollectionItem {
  return { id: newId(), bookmarkId: bookmark.id, title: bookmark.title, url: bookmark.url,
    icon: snapshotIcon(bookmark), recommendationReason: '' };
}

/** Always return detached drafts; library edits must not mutate authored content. */
export function collectionSections(collection: Collection): CollectionSection[] {
  if (collection.assetContent) return structuredClone(collection.assetContent.sections);
  return [{
    id: `section:${collection.id}`, title: '', description: '',
    items: [...collection.items].sort((a, b) => a.order - b.order).map((item, index) => ({
      id: `item:${collection.id}:${index}`, bookmarkId: item.bookmarkId || null,
      title: item.title, url: item.url, icon: snapshotIcon(item),
      recommendationReason: item.recommendationReason ?? '',
    })),
  }];
}

export function buildCollectionData(
  base: Collection | undefined, title: string, description: string, sections: CollectionSection[],
): Omit<Collection, 'id' | 'createdAt' | 'updatedAt'> {
  if (!title.trim()) throw new Error('TITLE_REQUIRED');
  if (title.length > ASSET_LIMITS.titleLength || description.length > ASSET_LIMITS.textLength
    || sections.some(s => s.title.length > ASSET_LIMITS.titleLength || s.description.length > ASSET_LIMITS.textLength
      || s.items.some(i => i.title.length > ASSET_LIMITS.titleLength
        || i.recommendationReason.length > ASSET_LIMITS.textLength))) throw new Error('CONTENT_TOO_LONG');
  const cleaned = structuredClone(sections);
  for (const section of cleaned) {
    section.title = section.title.trim();
    section.description = section.description.trim();
    for (const item of section.items) {
      if (!item.title.trim()) throw new Error('ITEM_TITLE_REQUIRED');
      try {
        const url = new URL(item.url.trim());
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
          || /[\s\u0000-\u001f\u007f]/u.test(item.url.trim())) throw new Error();
        item.url = url.href;
      } catch { throw new Error('INVALID_URL'); }
      item.title = item.title.trim();
      item.recommendationReason = item.recommendationReason.trim();
    }
  }
  const data: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'> = {
    ...(base ? (({ id, createdAt, updatedAt, ...rest }) => rest)(base) : {
      category: 'cat-inbox', authorId: 'user-me', authorName: '我',
      visibility: 'private' as const, isPinnedToDesktop: false,
    }),
    title: title.trim(), description: description.trim(),
    assetContent: {
      cover: structuredClone(base?.assetContent?.cover ?? null),
      provenance: structuredClone(base?.assetContent?.provenance ?? (base?.clonedFromId
        ? [{ sourceId: base.clonedFromId, title: null, author: null, url: null }] : [])),
      sections: cleaned,
    },
    items: cleaned.flatMap(s => s.items).map((item, order) => ({
      bookmarkId: item.bookmarkId ?? '', title: item.title, url: item.url,
      domain: new URL(item.url).hostname, order, recommendationReason: item.recommendationReason,
      ...(item.icon?.kind === 'url' ? { icon: item.icon.value, iconMode: item.icon.mode ?? 'custom' as const }
        : { iconMode: item.icon ? 'text' as const : 'auto' as const }),
    })),
  };
  // Validate the same bounded schema used by import/export before allowing a save.
  const candidate = { ...data, id: base?.id ?? newId(), createdAt: base?.createdAt ?? 0, updatedAt: 0 };
  const checked = validateSnapshot(prototypeAssetSnapshot({ bookmarks: [], folders: [], collections: [candidate] }));
  if (!checked.ok) throw new Error(checked.error.code);
  return data;
}

export function collectionMatches(collection: Collection, query: string): boolean {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [collection.title, collection.description, ...collectionSections(collection).flatMap(s => [
    s.title, s.description, ...s.items.flatMap(i => [i.title, i.url, i.recommendationReason]),
  ])].join('\n').toLocaleLowerCase();
  return words.every(word => haystack.includes(word));
}

export function exportSingleCollection(collection: Collection): string {
  const snapshot = prototypeAssetSnapshot({ bookmarks: [], folders: [], collections: [collection] });
  const result = exportAssets(snapshot, { kind: 'collection', id: collection.id }, Date.now());
  if (!result.ok) throw new Error(result.error.code);
  return JSON.stringify(result.value, null, 2);
}

const markdownText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/([\\`*_[\]{}()#+\-.!|])/g, '\\$1');

export function collectionMarkdown(collection: Collection): string {
  const lines = [`# ${markdownText(collection.title)}`, '', markdownText(collection.description), ''];
  for (const section of collectionSections(collection)) {
    if (section.title) lines.push(`## ${markdownText(section.title)}`, '');
    if (section.description) lines.push(markdownText(section.description), '');
    for (const item of section.items) {
      const url = new URL(item.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('INVALID_URL');
      const destination = url.href.replace(/[()<>]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
      lines.push(`- [${markdownText(item.title)}](${destination})`);
      if (item.recommendationReason) lines.push(`  ${markdownText(item.recommendationReason).replace(/\n/g, '\n  ')}`);
      lines.push('');
    }
  }
  const provenance = collection.assetContent?.provenance ?? [];
  for (const source of provenance) {
    lines.push(`> ${markdownText([source.title, source.author, source.url || source.sourceId].filter(Boolean).join(' · '))}`, '');
  }
  return lines.join('\n').trim() + '\n';
}

export function safeCollectionFilename(title: string): string {
  return title.replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, '-').trim().replace(/^\.+|\.+$/g, '').slice(0, 80) || 'collection';
}
