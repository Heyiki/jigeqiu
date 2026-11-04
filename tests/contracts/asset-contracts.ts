export type Id = string; // Non-empty opaque ID; never a name or path.
export type Timestamp = number; // Finite integer milliseconds since epoch.
export type Json =
  | null | boolean | number | string
  | Json[] | { [key: string]: Json };

export interface Icon {
  kind: 'monogram' | 'url';
  value: string;
  color: string | null;
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
export type LibraryRef =
  | { kind: 'bookmark'; id: Id }
  | { kind: 'folder'; id: Id };
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
export interface DesktopShortcut {
  id: Id;
  bookmarkId: Id;
}
export type DesktopRef =
  | { kind: 'shortcut'; id: Id }
  | { kind: 'desktop-folder'; id: Id };
export interface DesktopFolder {
  id: Id;
  name: string;
  shortcutIds: Id[];
}
export interface DockPin {
  id: Id;
  bookmarkId: Id;
}
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
export type Cover =
  | { kind: 'symbol'; symbol: string; color: string }
  | { kind: 'url'; url: string };
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
export interface LibraryPlacement {
  parentId: Id | null; // null = library root
  index: number;
}
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
export interface Revision {
  storeId: Id;
  revision: number;
  commitId: Id;
}
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
export interface AppError {
  code: ErrorCode;
  details: { [key: string]: Json };
}
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError };
export interface Notice {
  code: string; // Stable machine code, not user-facing prose.
  details: { [key: string]: Json };
}
export interface BookmarkInput {
  title: string;
  url: string;
  icon: Icon | null;
  notes: string;
  keywords: string[];
}
export type DesktopTarget =
  | { kind: 'root'; index: number }
  | { kind: 'folder'; folderId: Id; index: number };
export type AssetAction =
  | { type: 'bookmark.create'; id: Id; input: BookmarkInput;
      to: LibraryPlacement; duplicates: 'reject' | 'keep';
      desktop: { shortcutId: Id; to: DesktopTarget } | null }
  | { type: 'bookmark.update'; id: Id; input: BookmarkInput;
      duplicates: 'reject' | 'keep' }
  | { type: 'library.folder.create'; id: Id; name: string;
      to: LibraryPlacement }
  | { type: 'library.folder.rename'; id: Id; name: string }
  | { type: 'library.move'; refs: LibraryRef[]; to: LibraryPlacement }
  | { type: 'library.folder.dissolve'; id: Id }
  | { type: 'library.trash'; refs: LibraryRef[]; trashIds: Id[] }
  | { type: 'desktop.pin'; bookmarkId: Id; shortcutId: Id;
      to: DesktopTarget }
  | { type: 'desktop.unpin'; bookmarkId: Id }
  | { type: 'desktop.folder.create'; id: Id; name: string;
      shortcutIds: Id[]; index: number }
  | { type: 'desktop.folder.rename'; id: Id; name: string }
  | { type: 'desktop.move'; ref: DesktopRef; to: DesktopTarget }
  | { type: 'desktop.folder.remove'; id: Id;
      mode: 'dissolve' | 'remove-shortcuts' }
  | { type: 'dock.pin'; bookmarkId: Id; pinId: Id; index: number }
  | { type: 'dock.unpin'; bookmarkId: Id }
  | { type: 'dock.move'; pinId: Id; index: number }
  | { type: 'collection.save'; mode: 'create' | 'update';
      collection: Collection }
  | { type: 'collection.copy'; sourceId: Id; copy: Collection }
  | { type: 'collection.trash'; id: Id; trashId: Id }
  | { type: 'trash.restore'; ids: Id[] }
  | { type: 'trash.purge'; ids: Id[] };
export interface AssetCommand {
  commandId: Id;
  expected: Revision | null; // null only for first creation
  at: Timestamp;
  actions: AssetAction[];
}
export interface Reduction {
  next: AssetSnapshot;
  affectedIds: Id[];
  notices: Notice[];
}
export interface CommitReceipt {
  envelope: AssetEnvelope;
  affectedIds: Id[];
  notices: Notice[];
}
export declare function validateSnapshot(value: unknown):
  Result<AssetSnapshot>;
export declare function reduceCommand(
  snapshot: AssetSnapshot, command: AssetCommand
): Result<Reduction>;
export interface AssetService {
  execute(command: AssetCommand): Promise<Result<CommitReceipt>>;
}

export type ReadState =
  | { kind: 'empty' }
  | { kind: 'ready'; envelope: AssetEnvelope }
  | { kind: 'legacy'; raw: Record<string, string | null> };
export type WriteCapability =
  | { mode: 'web-locks' }
  | { mode: 'read-only'; reason: 'LOCK_UNAVAILABLE' };
export interface SnapshotChange {
  version: Revision | null;
  requiresReload: boolean;
}
export interface SnapshotStore extends AssetService {
  capability(): WriteCapability;
  read(): Promise<Result<ReadState>>;
  readRaw(): Result<string | null>;
  commit(
    expected: Revision | null,
    next: AssetSnapshot,
    commandId: Id,
    at: Timestamp
  ): Promise<Result<AssetEnvelope>>;
  subscribe(listener: (change: SnapshotChange) => void): () => void;
}

export interface AssetExchange {
  format: 'jigeqiu-assets';
  schemaVersion: 1;
  scope: 'all' | 'collection';
  exportedAt: Timestamp;
  library: Library;
  collections: Collection[];
}
export type ImportNode =
  | { kind: 'bookmark'; sourceId: Id; input: BookmarkInput }
  | { kind: 'folder'; sourceId: Id; name: string;
      children: ImportNode[] };
export interface ImportDocument {
  format: 'html' | 'json';
  roots: ImportNode[];
  collections: Collection[];
  notices: Notice[];
}
export interface ImportOptions {
  target:
    | { kind: 'existing'; folderId: Id | null }
    | { kind: 'new-container'; name: string };
  duplicateBookmarks: 'skip' | 'keep';
  duplicateCollections: 'skip-identical' | 'keep';
  folderBindings: { sourceId: Id; existingId: Id }[];
  missingParents: 'reject' | 'root';
  missingBookmarkLinks: 'reject' | 'detach';
}
export type MappingKind =
  | 'folder' | 'bookmark' | 'collection' | 'section' | 'item';
export interface IdMapping {
  kind: MappingKind;
  sourceId: Id;
  targetId: Id;
  disposition: 'created' | 'existing';
}
export interface ImportPreview {
  previewId: Id;
  expected: Revision | null;
  document: ImportDocument;
  options: ImportOptions;
  mappings: IdMapping[];
  next: AssetSnapshot;
  counts: { created: number; skipped: number; invalid: number };
  notices: Notice[];
}
export interface ImportReport {
  receipt: CommitReceipt;
  mappings: IdMapping[];
  counts: ImportPreview['counts'];
  notices: Notice[];
}
export interface ImportContext {
  base: AssetSnapshot;
  expected: Revision | null;
  previewId: Id;
  at: Timestamp;
  candidateIds: Id[];
}
export interface ImportService {
  parseHtml(text: string): Result<ImportDocument>;
  parseJson(text: string): Result<ImportDocument>;
  preview(
    document: ImportDocument, options: ImportOptions,
    context: ImportContext
  ): Result<ImportPreview>;
  commit(preview: ImportPreview): Promise<Result<ImportReport>>;
}
export declare function exportAssets(
  snapshot: AssetSnapshot,
  scope: { kind: 'all' } | { kind: 'collection'; id: Id },
  at: Timestamp
): Result<AssetExchange>;

export interface LegacyConflict {
  code:
    | 'BOOKMARK_MULTIPLE_OWNERS' | 'MISSING_OWNER'
    | 'FOLDER_CYCLE' | 'DUPLICATE_LEGACY_ID'
    | 'DESKTOP_MULTIPLE_GROUPS' | 'LEGACY_PUBLIC_CONTENT';
  sourceId: Id;
  candidateFolderIds: Id[];
  details: { [key: string]: Json };
}
export interface LegacyDecisions {
  libraryOwners: { bookmarkId: Id; folderId: Id | null }[];
  desktopOwners: { bookmarkId: Id; desktopFolderSourceId: Id | null }[];
  brokenFolderParents: { folderId: Id; parentId: Id | null }[];
  collectionIdsToKeep: Id[];
}
export interface LegacyPreview {
  previewId: Id;
  expected: Revision | null;
  raw: Record<string, string | null>;
  conflicts: LegacyConflict[];
  unresolved: number;
  next: AssetSnapshot | null;
  mappings: IdMapping[];
  notices: Notice[];
}
export interface MigrationService {
  readLegacyRaw(): Result<Record<string, string | null>>;
  preview(
    raw: Record<string, string | null>,
    decisions: LegacyDecisions,
    context: ImportContext
  ): Result<LegacyPreview>;
  commit(
    preview: LegacyPreview, rawBackupAcknowledged: boolean
  ): Promise<Result<CommitReceipt>>;
}

export interface SearchEngine {
  id: Id;
  name: string;
  icon: Icon | null;
  keyword: string;
  urlTemplate: string;
  enabled: boolean;
}
export interface ShortcutBinding {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}
export interface Settings {
  locale: 'zh-CN';
  appearance: 'light-glass' | 'dark-glass' | 'reduced-transparency';
  wallpaper: string;
  reduceMotion: boolean;
  externalIcons: boolean;
  confirmBatchOpen: boolean;
  backupReminderDays: number | null;
  engines: SearchEngine[];
  defaultEngineId: Id;
  shortcuts: {
    launchpad: ShortcutBinding | null;
    search: ShortcutBinding | null;
  };
  dock: {
    visible: boolean;
    iconSize: number;
    magnification: boolean;
    autoHide: boolean;
  };
}
export interface History {
  enabled: boolean;
  searches: { query: string; at: Timestamp }[];
  used: { bookmarkId: Id; at: Timestamp }[];
}
export interface LocalEnvelope<T> {
  schemaVersion: 1;
  version: Revision;
  value: T;
}
export interface LocalDomainStore<T> {
  read(): Promise<Result<LocalEnvelope<T> | null>>;
  commit(
    expected: Revision | null, value: T,
    commandId: Id
  ): Promise<Result<LocalEnvelope<T>>>;
}
export type SettingsStore = LocalDomainStore<Settings>;
export type HistoryStore = LocalDomainStore<History>;
