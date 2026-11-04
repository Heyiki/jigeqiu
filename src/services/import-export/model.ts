import type {
  AssetSnapshot, Collection, Id, Library, Result, Revision, Timestamp,
} from '../../domain/assets/model';
import type { BookmarkInput, CommitReceipt, Notice } from '../../domain/assets/commands';

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
  | { kind: 'folder'; sourceId: Id; name: string; children: ImportNode[] };
export interface ImportDocument {
  format: 'html' | 'json';
  roots: ImportNode[];
  collections: Collection[];
  notices: Notice[];
}
export interface ImportOptions {
  target: { kind: 'existing'; folderId: Id | null } | { kind: 'new-container'; name: string };
  duplicateBookmarks: 'skip' | 'keep';
  duplicateCollections: 'skip-identical' | 'keep';
  folderBindings: { sourceId: Id; existingId: Id }[];
  missingParents: 'reject' | 'root';
  missingBookmarkLinks: 'reject' | 'detach';
}
export type MappingKind = 'folder' | 'bookmark' | 'collection' | 'section' | 'item';
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
export interface JsonImportService {
  parseJson(text: string): Result<ImportDocument>;
  preview(document: ImportDocument, options: ImportOptions, context: ImportContext): Result<ImportPreview>;
  commit(preview: ImportPreview): Promise<Result<ImportReport>>;
}
export interface ImportService extends JsonImportService {
  parseHtml(text: string): Result<ImportDocument>;
}
