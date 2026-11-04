export type Id = string;
export type Timestamp = number;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface Icon {
  kind: 'monogram' | 'url';
  value: string;
  color: string | null;
  mode?: 'auto' | 'custom';
}
export interface Bookmark {
  id: Id;
  title: string;
  url: string;
  icon: Icon | null;
  notes: string;
  keywords: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export type LibraryRef = { kind: 'bookmark'; id: Id } | { kind: 'folder'; id: Id };
export interface LibraryFolder {
  id: Id;
  name: string;
  children: LibraryRef[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export interface Library {
  bookmarks: Bookmark[];
  folders: LibraryFolder[];
  root: LibraryRef[];
}
export interface DesktopShortcut { id: Id; bookmarkId: Id }
export type DesktopRef = { kind: 'shortcut'; id: Id } | { kind: 'desktop-folder'; id: Id };
export interface DesktopFolder { id: Id; name: string; shortcutIds: Id[] }
export interface DockPin { id: Id; bookmarkId: Id }
export interface Layout {
  shortcuts: DesktopShortcut[];
  folders: DesktopFolder[];
  root: DesktopRef[];
  dock: DockPin[];
}
export interface Provenance {
  sourceId: string;
  title: string | null;
  author: string | null;
  url: string | null;
}
export interface CollectionItem {
  id: Id;
  bookmarkId: Id | null;
  title: string;
  url: string;
  icon: Icon | null;
  recommendationReason: string;
}
export interface CollectionSection {
  id: Id;
  title: string;
  description: string;
  items: CollectionItem[];
}
export type Cover = { kind: 'symbol'; symbol: string; color: string } | { kind: 'url'; url: string };
export interface Collection {
  id: Id;
  title: string;
  description: string;
  cover: Cover | null;
  provenance: Provenance[];
  sections: CollectionSection[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export interface LibraryPlacement { parentId: Id | null; index: number }
export type TrashPayload =
  | { kind: 'bookmark'; bookmark: Bookmark }
  | { kind: 'folder-tree'; rootFolderId: Id; library: Library }
  | { kind: 'collection'; collection: Collection; index: number };
export interface TrashEntry {
  id: Id;
  deletedAt: Timestamp;
  origin: LibraryPlacement | null;
  payload: TrashPayload;
}
export interface AssetSnapshot {
  library: Library;
  layout: Layout;
  collections: Collection[];
  trash: TrashEntry[];
}
export interface Revision { storeId: Id; revision: number; commitId: Id }
export interface AssetEnvelope {
  format: 'jigeqiu-local-assets';
  schemaVersion: 1;
  version: Revision;
  committedAt: Timestamp;
  snapshot: AssetSnapshot;
}
export type ErrorCode =
  | 'INVALID_INPUT' | 'INVALID_URL' | 'INVALID_REFERENCE' | 'CYCLE'
  | 'DUPLICATE_REQUIRES_DECISION' | 'ID_COLLISION' | 'NOT_FOUND'
  | 'STORAGE_UNAVAILABLE' | 'QUOTA_EXCEEDED' | 'STORAGE_WRITE_FAILED'
  | 'CORRUPT_DATA' | 'UNSUPPORTED_VERSION' | 'LEGACY_REQUIRES_PREVIEW'
  | 'CONFLICT' | 'LOCK_UNAVAILABLE' | 'COMMIT_UNCERTAIN'
  | 'IMPORT_INVALID' | 'IMPORT_TOO_LARGE' | 'PREVIEW_STALE'
  | 'MIGRATION_DECISION_REQUIRED' | 'CANCELLED';
export interface AppError { code: ErrorCode; details: { [key: string]: Json } }
export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };
