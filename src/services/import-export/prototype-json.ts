import type { Bookmark, Collection, Folder } from '../../types';
import type { AssetSnapshot, Icon, LibraryRef, Result } from '../../domain/assets/model';
import type { Notice } from '../../domain/assets/commands';
import { exportAssets, parseJson } from './exchange';
import { previewImport } from './preview';
import type { ImportDocument, ImportNode } from './model';

export interface JsonAssetState { bookmarks: Bookmark[]; folders: Folder[]; collections: Collection[] }
export interface JsonAssetPreview {
  counts: { bookmarks: number; folders: number; collections: number; skipped: number };
  notices: Notice[];
  next: JsonAssetState;
}
function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}
function sameIconUrl(left: string, right?: string): boolean {
  if (!right) return false;
  try { return new URL(left).href === new URL(right).href; } catch { return false; }
}
function iconFor(item: { icon?: string; iconMode?: string; title: string; assetIcon?: Icon }): Icon | null {
  if (item.assetIcon && ((item.iconMode === 'text' && item.assetIcon.kind === 'monogram')
    || (item.assetIcon.kind === 'url' && sameIconUrl(item.assetIcon.value, item.icon)
      && (item.assetIcon.mode ?? 'custom') === item.iconMode))) return structuredClone(item.assetIcon);
  if (item.iconMode === 'text') return { kind: 'monogram', value: item.title.slice(0, 2) || '?', color: null };
  if (!item.icon) return null;
  return { kind: 'url', value: item.icon, color: null,
    ...(item.iconMode === 'auto' || item.iconMode === 'custom' ? { mode: item.iconMode } : {}) };
}
function iconFields(icon: Icon | null): Pick<Bookmark, 'icon' | 'iconMode' | 'assetIcon'> {
  return icon?.kind === 'url' ? { icon: icon.value, iconMode: icon.mode ?? 'custom', assetIcon: icon }
    : icon ? { iconMode: 'text', assetIcon: icon } : { iconMode: 'auto' };
}
const ordered = <T extends { order: number }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.order - b.order);

/** Adapt only asset content; neither settings nor desktop flags enter the exchange. */
export function prototypeAssetSnapshot(state: JsonAssetState): AssetSnapshot {
  const used = new Set([...state.bookmarks, ...state.folders, ...state.collections].map(item => item.id));
  const synthetic = (seed: string) => {
    let id = seed.slice(0, 220), n = 0;
    while (used.has(id)) id = `${seed.slice(0, 210)}:${++n}`;
    used.add(id);
    return id;
  };
  const folderIds = new Set(state.folders.map(folder => folder.id));
  for (const bookmark of state.bookmarks) {
    if (bookmark.folderId && !folderIds.has(bookmark.folderId)) throw new Error('INVALID_REFERENCE');
  }
  for (const folder of state.folders) {
    if (folder.parentId && !folderIds.has(folder.parentId)) throw new Error('INVALID_REFERENCE');
  }
  const refs = (parent?: string): LibraryRef[] => ordered([
    ...state.bookmarks.filter(b => b.folderId === parent).map(b => ({ order: b.order, kind: 'bookmark' as const, id: b.id })),
    ...state.folders.filter(f => f.parentId === parent).map(f => ({ order: f.order, kind: 'folder' as const, id: f.id })),
  ]).map(({ kind, id }) => ({ kind, id }));
  const active = new Set(state.bookmarks.map(b => b.id));
  return {
    library: {
      bookmarks: state.bookmarks.map(b => ({
        id: b.id, title: b.title, url: b.url, icon: iconFor(b), notes: b.notes ?? '',
        keywords: b.keywords ?? [], createdAt: b.createdAt, updatedAt: b.updatedAt,
      })),
      folders: state.folders.map(f => ({
        id: f.id, name: f.name, children: refs(f.id), createdAt: f.createdAt, updatedAt: f.updatedAt,
      })),
      root: refs(),
    },
    collections: state.collections.map(c => {
      const sections = c.assetContent ? structuredClone(c.assetContent.sections) : [{
        id: synthetic(`section:${c.id}`), title: '', description: '',
        items: ordered(c.items).map((item, index) => ({
          id: synthetic(`item:${c.id}:${index}`), bookmarkId: active.has(item.bookmarkId) ? item.bookmarkId : null,
          title: item.title, url: item.url, icon: iconFor(item), recommendationReason: item.recommendationReason ?? '',
        })),
      }];
      if (c.assetContent) for (const section of sections) {
        section.id = synthetic(`section:${c.id}:${section.id}`);
        for (const item of section.items) item.id = synthetic(`item:${c.id}:${item.id}`);
      }
      for (const section of sections) for (const item of section.items) {
        if (item.bookmarkId !== null && !active.has(item.bookmarkId)) item.bookmarkId = null;
      }
      return {
        id: c.id, title: c.title, description: c.description, cover: c.assetContent?.cover ?? null,
        provenance: c.assetContent?.provenance ?? (c.clonedFromId ? [{
          sourceId: c.clonedFromId, title: null, author: null, url: null,
        }] : []),
        sections, createdAt: c.createdAt, updatedAt: c.updatedAt,
      };
    }),
    layout: { shortcuts: [], folders: [], root: [], dock: [] }, trash: [],
  };
}

export function exportPrototypeAssets(state: JsonAssetState, at: number): string {
  return JSON.stringify(value(exportAssets(prototypeAssetSnapshot(state), { kind: 'all' }, at)), null, 2);
}

function bindFolders(document: ImportDocument, snapshot: AssetSnapshot) {
  const bindings: { sourceId: string; existingId: string }[] = [];
  const folders = new Map(snapshot.library.folders.map(f => [f.id, f]));
  const bound = new Set<string>();
  function walk(nodes: ImportNode[], refs: LibraryRef[]) {
    for (const node of nodes) {
      if (node.kind !== 'folder') continue;
      const matches = refs.filter(ref => ref.kind === 'folder' && !bound.has(ref.id)
        && folders.get(ref.id)?.name === node.name);
      // Ambiguous same-name folders are never guessed or silently merged.
      if (matches.length !== 1) continue;
      const folder = folders.get(matches[0].id)!;
      bound.add(folder.id);
      bindings.push({ sourceId: node.sourceId, existingId: folder.id });
      walk(node.children, folder.children);
    }
  }
  walk(document.roots, snapshot.library.root);
  return bindings;
}

export function preparePrototypeJsonImport(
  text: string, current: JsonAssetState, keepCopies: boolean, newId: () => string, at: number,
): JsonAssetPreview {
  const document = value(parseJson(text));
  const snapshot = prototypeAssetSnapshot(current);
  const countNodes = (nodes: ImportNode[]): number =>
    nodes.reduce((n, node) => n + 1 + (node.kind === 'folder' ? countNodes(node.children) : 0), 0);
  const count = countNodes(document.roots) + document.collections.reduce((n, c) =>
    n + 1 + c.sections.reduce((n, s) => n + 1 + s.items.length, 0), 0);
  const plan = value(previewImport(document, {
    target: { kind: 'existing', folderId: null },
    duplicateBookmarks: keepCopies ? 'keep' : 'skip', duplicateCollections: keepCopies ? 'keep' : 'skip-identical',
    folderBindings: keepCopies ? [] : bindFolders(document, snapshot),
    missingParents: 'reject', missingBookmarkLinks: 'detach',
  }, {
    base: snapshot, expected: null, previewId: newId(), at,
    candidateIds: Array.from({ length: count }, newId),
  }));
  const imported = JSON.parse(text);
  const originals = new Map<string, { createdAt: number; updatedAt: number }>(
    [...imported.library.bookmarks, ...imported.library.folders, ...imported.collections].map(item => [item.id, item]),
  );
  const sources = new Map(plan.mappings.filter(m => m.disposition === 'created').map(m => [m.targetId, m.sourceId]));
  const dates = (id: string) => {
    const source = originals.get(sources.get(id)!);
    return source ? { createdAt: source.createdAt, updatedAt: source.updatedAt } : { createdAt: at, updatedAt: at };
  };
  const oldBookmarks = new Map(current.bookmarks.map(b => [b.id, b]));
  const oldFolders = new Map(current.folders.map(f => [f.id, f]));
  const oldCollections = new Map(current.collections.map(c => [c.id, c]));
  const positions = new Map<string, { parentId?: string; order: number }>();
  const place = (refs: LibraryRef[], parentId?: string) => {
    const old = [...current.bookmarks.filter(b => b.folderId === parentId),
      ...current.folders.filter(f => f.parentId === parentId)];
    let order = Math.max(-1, ...old.map(item => item.order));
    refs.forEach(ref => {
      const existing = old.find(item => item.id === ref.id);
      positions.set(ref.id, { parentId, order: existing?.order ?? ++order });
    });
  };
  place(plan.next.library.root);
  for (const folder of plan.next.library.folders) place(folder.children, folder.id);
  const next: JsonAssetState = {
    bookmarks: plan.next.library.bookmarks.map(b => oldBookmarks.get(b.id) ?? ({
      id: b.id, title: b.title, url: b.url, domain: new URL(b.url).hostname,
      ...iconFields(b.icon), notes: b.notes, keywords: b.keywords, category: 'cat-inbox', tags: [],
      ...(positions.get(b.id)?.parentId ? { folderId: positions.get(b.id)!.parentId } : {}),
      order: positions.get(b.id)!.order, pinnedToDesktop: false, collectionIds: [], ...dates(b.id),
    })),
    folders: plan.next.library.folders.map(f => {
      const existing = oldFolders.get(f.id);
      const bookmarkIds = f.children.filter(r => r.kind === 'bookmark').map(r => r.id);
      return existing ? { ...existing, bookmarkIds: [
        ...existing.bookmarkIds, ...bookmarkIds.filter(id => !existing.bookmarkIds.includes(id)),
      ] } : {
        id: f.id, name: f.name, bookmarkIds, ...(positions.get(f.id)?.parentId ? { parentId: positions.get(f.id)!.parentId } : {}),
        order: positions.get(f.id)!.order, pinnedToDesktop: false, ...dates(f.id),
      };
    }),
    collections: plan.next.collections.map(c => oldCollections.get(c.id) ?? ({
      id: c.id, title: c.title, description: c.description, category: 'cat-inbox',
      authorId: 'user-me', authorName: '我', visibility: 'private', isPinnedToDesktop: false,
      assetContent: { cover: c.cover, provenance: c.provenance, sections: c.sections },
      items: c.sections.flatMap(section => section.items).map((item, order) => ({
        bookmarkId: item.bookmarkId ?? '', title: item.title, url: item.url,
        domain: new URL(item.url).hostname, ...iconFields(item.icon), order,
        recommendationReason: item.recommendationReason,
      })),
      ...dates(c.id),
    })),
  };
  const created = (kind: string) => plan.mappings.filter(m => m.kind === kind && m.disposition === 'created').length;
  return {
    next, notices: plan.notices,
    counts: { bookmarks: created('bookmark'), folders: created('folder'), collections: created('collection'),
      skipped: plan.mappings.filter(m => ['bookmark', 'folder', 'collection'].includes(m.kind) && m.disposition === 'existing').length },
  };
}
