import type { AssetCommand } from './commands';
import type { Result } from './model';
import { ASSET_LIMITS, captureJsonInput } from './validation';

type Check = (value: unknown) => boolean;
const id: Check = (v) => typeof v === 'string' && !!v.trim() && v.length <= ASSET_LIMITS.idLength;
const text: Check = (v) => typeof v === 'string' && v.length <= ASSET_LIMITS.titleLength;
const integer: Check = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const choice = (...values: string[]): Check => (v) => typeof v === 'string' && values.includes(v);
const nullable = (check: Check): Check => (v) => v === null || check(v);
const list = (check: Check): Check => (v) => Array.isArray(v) && v.length <= ASSET_LIMITS.arrayLength && v.every(check);
const record: Check = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function shape(fields: Record<string, Check>): Check {
  return (v) => record(v) && Object.keys(v as object).length === Object.keys(fields).length
    && Object.entries(fields).every(([key, check]) => Object.hasOwn(v as object, key) && check((v as Record<string, unknown>)[key]));
}
const placement = shape({ parentId: nullable(id), index: integer });
const desktopTarget: Check = (v) => shape({ kind: choice('root'), index: integer })(v)
  || shape({ kind: choice('folder'), folderId: id, index: integer })(v);
const libraryRef = shape({ kind: choice('bookmark', 'folder'), id });
const desktopRef = shape({ kind: choice('shortcut', 'desktop-folder'), id });
const bookmarkInput = shape({
  title: text, url: (v) => typeof v === 'string',
  icon: nullable(record), notes: (v) => typeof v === 'string',
  keywords: list((v) => typeof v === 'string'),
});
const fields: Record<string, Record<string, Check>> = {
  'bookmark.create': { id, input: bookmarkInput, to: placement, duplicates: choice('reject', 'keep'),
    desktop: nullable(shape({ shortcutId: id, to: desktopTarget })) },
  'bookmark.update': { id, input: bookmarkInput, duplicates: choice('reject', 'keep') },
  'library.folder.create': { id, name: text, to: placement },
  'library.folder.rename': { id, name: text },
  'library.move': { refs: list(libraryRef), to: placement },
  'library.folder.dissolve': { id },
  'library.trash': { refs: list(libraryRef), trashIds: list(id) },
  'desktop.pin': { bookmarkId: id, shortcutId: id, to: desktopTarget },
  'desktop.unpin': { bookmarkId: id },
  'desktop.folder.create': { id, name: text, shortcutIds: list(id), index: integer },
  'desktop.folder.rename': { id, name: text },
  'desktop.move': { ref: desktopRef, to: desktopTarget },
  'desktop.folder.remove': { id, mode: choice('dissolve', 'remove-shortcuts') },
  'dock.pin': { bookmarkId: id, pinId: id, index: integer },
  'dock.unpin': { bookmarkId: id },
  'dock.move': { pinId: id, index: integer },
  'collection.save': { mode: choice('create', 'update'), collection: record },
  'collection.copy': { sourceId: id, copy: record },
  'collection.trash': { id, trashId: id },
  'trash.restore': { ids: list(id) },
  'trash.purge': { ids: list(id) },
};
const revision = shape({
  storeId: id, commitId: id,
  revision: (v) => integer(v) && (v as number) > 0,
});
const action: Check = (v) => {
  if (!record(v)) return false;
  const type = (v as Record<string, unknown>).type;
  return typeof type === 'string' && Object.hasOwn(fields, type)
    && shape({ type: choice(type), ...fields[type] })(v);
};
export function validateCommand(value: unknown): Result<AssetCommand> {
  const captured = captureJsonInput(value);
  if (!captured.ok) return captured;
  const valid = shape({
    commandId: id, expected: nullable(revision), at: integer,
    actions: (v) => list(action)(v) && (v as unknown[]).length > 0,
  })(captured.value);
  return valid ? { ok: true, value: captured.value as unknown as AssetCommand }
    : { ok: false, error: { code: 'INVALID_INPUT', details: { reason: 'invalid-command' } } };
}
