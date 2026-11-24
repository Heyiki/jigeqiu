export type BookmarkSource = 'extension' | 'browser';
export type BookmarkSourceProblem = 'permission' | 'unavailable' | 'changed' | 'uncertain';

export interface BookmarkSourcePlatform {
  source(): BookmarkSource;
  problem(): BookmarkSourceProblem | undefined;
  switchSource(source: BookmarkSource): Promise<void>;
  subscribe(listener: () => void): () => void;
}
let platform: BookmarkSourcePlatform | undefined;
/** Only the extension entry point installs this platform. */
export function configureBookmarkSourcePlatform(next: BookmarkSourcePlatform | undefined) { platform = next; }
export function getBookmarkSourcePlatform(): BookmarkSourcePlatform | undefined { return platform; }
