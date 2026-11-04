import type {
  AssetEnvelope, AssetSnapshot, Bookmark, Collection, Id, Json, LibraryPlacement,
  LibraryRef, DesktopRef, Revision, Result, Timestamp,
} from './model';

export interface Notice { code: string; details: { [key: string]: Json } }
export type BookmarkInput = Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>;
export type DesktopTarget =
  | { kind: 'root'; index: number }
  | { kind: 'folder'; folderId: Id; index: number };
export type AssetAction =
  | { type: 'bookmark.create'; id: Id; input: BookmarkInput; to: LibraryPlacement;
      duplicates: 'reject' | 'keep'; desktop: { shortcutId: Id; to: DesktopTarget } | null }
  | { type: 'bookmark.update'; id: Id; input: BookmarkInput; duplicates: 'reject' | 'keep' }
  | { type: 'library.folder.create'; id: Id; name: string; to: LibraryPlacement }
  | { type: 'library.folder.rename'; id: Id; name: string }
  | { type: 'library.move'; refs: LibraryRef[]; to: LibraryPlacement }
  | { type: 'library.folder.dissolve'; id: Id }
  | { type: 'library.trash'; refs: LibraryRef[]; trashIds: Id[] }
  | { type: 'desktop.pin'; bookmarkId: Id; shortcutId: Id; to: DesktopTarget }
  | { type: 'desktop.unpin'; bookmarkId: Id }
  | { type: 'desktop.folder.create'; id: Id; name: string; shortcutIds: Id[]; index: number }
  | { type: 'desktop.folder.rename'; id: Id; name: string }
  | { type: 'desktop.move'; ref: DesktopRef; to: DesktopTarget }
  | { type: 'desktop.folder.remove'; id: Id; mode: 'dissolve' | 'remove-shortcuts' }
  | { type: 'dock.pin'; bookmarkId: Id; pinId: Id; index: number }
  | { type: 'dock.unpin'; bookmarkId: Id }
  | { type: 'dock.move'; pinId: Id; index: number }
  | { type: 'collection.save'; mode: 'create' | 'update'; collection: Collection }
  | { type: 'collection.copy'; sourceId: Id; copy: Collection }
  | { type: 'collection.trash'; id: Id; trashId: Id }
  | { type: 'trash.restore'; ids: Id[] }
  | { type: 'trash.purge'; ids: Id[] };
export interface AssetCommand {
  commandId: Id; expected: Revision | null; at: Timestamp; actions: AssetAction[];
}
export interface Reduction { next: AssetSnapshot; affectedIds: Id[]; notices: Notice[] }
export interface CommitReceipt { envelope: AssetEnvelope; affectedIds: Id[]; notices: Notice[] }
export interface AssetService { execute(command: AssetCommand): Promise<Result<CommitReceipt>> }
