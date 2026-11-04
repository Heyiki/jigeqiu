import type {
  AppError, AssetEnvelope, AssetSnapshot, Collection, ErrorCode, Json, Library, Result,
} from './model';

export const ASSET_LIMITS = {
  idLength: 256, titleLength: 1024, textLength: 32768, urlLength: 8192,
  symbolLength: 64, colorLength: 128,
  keywordLength: 256, keywords: 100, nodes: 20000, arrayLength: 20000,
  libraryDepth: 64, jsonDepth: 32, jsonNodes: 1000000, bytes: 16 * 1024 * 1024,
} as const;

class ValidationFailure {
  constructor(readonly error: AppError) {}
}

function reject(path: string, reason: string, code: ErrorCode = 'INVALID_INPUT'): never {
  throw new ValidationFailure({ code, details: { path, reason } });
}

type Check = (value: unknown, path: string) => void;

function text(max: number, nonempty = false): Check {
  return (value, path) => {
    if (typeof value !== 'string' || value.length > max || (nonempty && !value.trim())) {
      reject(path, 'string-length-or-type');
    }
  };
}
const id = text(ASSET_LIMITS.idLength, true);
const title = text(ASSET_LIMITS.titleLength);
const body = text(ASSET_LIMITS.textLength);
const integer: Check = (value, path) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    reject(path, 'nonnegative-safe-integer-required');
  }
};
const url: Check = (value, path) => {
  text(ASSET_LIMITS.urlLength, true)(value, path);
  const raw = value as string;
  if (!/^https?:\/\//i.test(raw) || /[\s\u0000-\u001f\u007f]/u.test(raw)) {
    reject(path, 'http-https-url-required', 'INVALID_URL');
  }
  try {
    const parsed = new URL(raw);
    if (!parsed.hostname || !['http:', 'https:'].includes(parsed.protocol)) {
      reject(path, 'http-https-url-required', 'INVALID_URL');
    }
  } catch (error) {
    if (error instanceof ValidationFailure) throw error;
    reject(path, 'malformed-url', 'INVALID_URL');
  }
};
const mediaUrl: Check = (value, path) => {
  url(value, path);
  const parsed = new URL(value as string);
  if (parsed.username || parsed.password) reject(path, 'media-credentials-forbidden', 'INVALID_URL');
};
function literal(expected: string | number): Check {
  return (value, path) => { if (value !== expected) reject(path, 'unexpected-literal'); };
}
function nullable(check: Check): Check {
  return (value, path) => { if (value !== null) check(value, path); };
}
function array(check: Check, max: number = ASSET_LIMITS.arrayLength): Check {
  return (value, path) => {
    if (!Array.isArray(value) || value.length > max) reject(path, 'array-length-or-type');
    value.forEach((item, index) => check(item, `${path}[${index}]`));
  };
}
function object(fields: Record<string, Check>): Check {
  const keys = Object.keys(fields);
  return (value, path) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) reject(path, 'object-required');
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== keys.length || keys.some(key => !Object.hasOwn(record, key))) {
      reject(path, 'exact-fields-required');
    }
    for (const key of keys) fields[key](record[key], `${path}.${key}`);
  };
}
function optionalIconMode(check: Check): Check {
  return (value, path) => {
    if (value && typeof value === 'object' && Object.hasOwn(value, 'mode')) {
      const { mode, ...rest } = value as Record<string, unknown>;
      if (mode !== 'auto' && mode !== 'custom') reject(path, 'invalid-icon-mode');
      check(rest, path);
    } else check(value, path);
  };
}
function variant(tag: string, variants: Record<string, Check>): Check {
  return (value, path) => {
    if (!value || typeof value !== 'object') reject(path, 'tagged-object-required');
    const kind = (value as Record<string, unknown>)[tag];
    if (typeof kind !== 'string' || !Object.hasOwn(variants, kind)) reject(path, 'unknown-kind');
    variants[kind](value, path);
  };
}
const icon = nullable(variant('kind', {
  monogram: object({ kind: literal('monogram'), value: text(ASSET_LIMITS.symbolLength, true), color: nullable(text(ASSET_LIMITS.colorLength)) }),
  url: optionalIconMode(object({ kind: literal('url'), value: mediaUrl, color: nullable(text(ASSET_LIMITS.colorLength)) })),
}));
const bookmark = object({
  id, title, url, icon, notes: body, keywords: array(text(ASSET_LIMITS.keywordLength), ASSET_LIMITS.keywords),
  createdAt: integer, updatedAt: integer,
});
const libraryRef = variant('kind', {
  bookmark: object({ kind: literal('bookmark'), id }),
  folder: object({ kind: literal('folder'), id }),
});
const library = object({
  bookmarks: array(bookmark),
  folders: array(object({ id, name: title, children: array(libraryRef), createdAt: integer, updatedAt: integer })),
  root: array(libraryRef),
});
const collection = object({
  id, title, description: body,
  cover: nullable(variant('kind', {
    symbol: object({ kind: literal('symbol'), symbol: text(ASSET_LIMITS.symbolLength, true), color: text(ASSET_LIMITS.colorLength, true) }),
    url: object({ kind: literal('url'), url: mediaUrl }),
  })),
  provenance: array(object({ sourceId: id, title: nullable(title), author: nullable(title), url: nullable(url) })),
  sections: array(object({
    id, title, description: body,
    items: array(object({ id, bookmarkId: nullable(id), title, url, icon, recommendationReason: body })),
  })),
  createdAt: integer, updatedAt: integer,
});
const snapshotSchema = object({
  library,
  layout: object({
    shortcuts: array(object({ id, bookmarkId: id })),
    folders: array(object({ id, name: title, shortcutIds: array(id) })),
    root: array(variant('kind', {
      shortcut: object({ kind: literal('shortcut'), id }),
      'desktop-folder': object({ kind: literal('desktop-folder'), id }),
    })),
    dock: array(object({ id, bookmarkId: id })),
  }),
  collections: array(collection),
  trash: array(object({
    id, deletedAt: integer,
    origin: nullable(object({ parentId: nullable(id), index: integer })),
    payload: variant('kind', {
      bookmark: object({ kind: literal('bookmark'), bookmark }),
      'folder-tree': object({ kind: literal('folder-tree'), rootFolderId: id, library }),
      collection: object({ kind: literal('collection'), collection, index: integer }),
    }),
  })),
});
const envelopeSchema = object({
  format: literal('jigeqiu-local-assets'), schemaVersion: literal(1),
  version: object({
    storeId: id, commitId: id,
    revision: (value, path) => { integer(value, path); if (value === 0) reject(path, 'positive-revision-required'); },
  }),
  committedAt: integer, snapshot: snapshotSchema,
});

// Inspect data descriptors before cloning, without reading ordinary properties.
// Proxies may forge descriptors; structuredClone rejects them before schema use.
function descriptorBudget(value: unknown, maxDepth: number): void {
  let nodes = 0;
  let characters = 0;
  const ancestors = new Set<object>();
  function visit(current: unknown, depth: number): void {
    if (++nodes > ASSET_LIMITS.jsonNodes || depth > maxDepth) reject('$', 'json-budget');
    if (current === null || typeof current === 'boolean') return;
    if (typeof current === 'string') {
      characters += current.length;
      if (characters > ASSET_LIMITS.bytes) reject('$', 'byte-budget');
      return;
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) reject('$', 'finite-number-required');
      return;
    }
    if (typeof current !== 'object') reject('$', 'json-value-required');
    const isArray = Array.isArray(current);
    const prototype = Object.getPrototypeOf(current);
    if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      reject('$', 'plain-json-value-required');
    }
    if (ancestors.has(current)) reject('$', 'cyclic-json');
    ancestors.add(current);
    const descriptors = Object.getOwnPropertyDescriptors(current);
    const keys = Reflect.ownKeys(descriptors);
    const length = isArray ? descriptors.length?.value : 0;
    if (isArray) {
      if (!Number.isSafeInteger(length) || length < 0 ||
        length > ASSET_LIMITS.arrayLength || keys.length !== length + 1) {
        reject('$', 'dense-bounded-array-required');
      }
    }
    for (const key of keys) {
      if (typeof key !== 'string') reject('$', 'symbol-field');
      if (isArray && key === 'length') continue;
      if (isArray && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length)) {
        reject('$', 'array-extra-field');
      }
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) reject('$', 'data-fields-required');
      characters += key.length;
      visit(descriptor.value, depth + 1);
    }
    ancestors.delete(current);
  }
  visit(value, 0);
}

function libraryRelations(value: Library, path: string): void {
  const bookmarks = new Set(value.bookmarks.map(item => item.id));
  const folders = new Map(value.folders.map(item => [item.id, item]));
  const seen = new Set<string>();
  const visiting = new Set<string>();
  const heights = new Map<string, number>();
  function height(folderId: string): number {
    if (visiting.has(folderId)) reject(path, 'folder-cycle', 'CYCLE');
    const known = heights.get(folderId);
    if (known !== undefined) return known;
    if (visiting.size >= ASSET_LIMITS.libraryDepth) reject(path, 'library-depth');
    visiting.add(folderId);
    let result = 1;
    for (const ref of folders.get(folderId)!.children) {
      if (ref.kind === 'folder') {
        if (!folders.has(ref.id)) reject(path, 'missing-folder', 'INVALID_REFERENCE');
        result = Math.max(result, 1 + height(ref.id));
      }
    }
    visiting.delete(folderId);
    if (result > ASSET_LIMITS.libraryDepth) reject(path, 'library-depth');
    heights.set(folderId, result);
    return result;
  }
  // Check every component, not just roots, so disconnected cycles are reported.
  for (const folder of value.folders) height(folder.id);
  function own(ref: Library['root'][number]): void {
    if (!(ref.kind === 'bookmark' ? bookmarks.has(ref.id) : folders.has(ref.id)) || seen.has(ref.id)) {
      reject(path, 'missing-or-multiply-owned-entity', 'INVALID_REFERENCE');
    }
    seen.add(ref.id);
  }
  value.root.forEach(own);
  for (const folder of value.folders) folder.children.forEach(own);
  if (seen.size !== bookmarks.size + folders.size) reject(path, 'orphan-entity', 'INVALID_REFERENCE');
}

function relations(snapshot: AssetSnapshot): void {
  const ids = new Set<string>();
  const libraryFolderIds = new Set<string>();
  function register(entity: { id: string }): void {
    if (ids.has(entity.id)) reject('$.id', 'global-id-collision', 'ID_COLLISION');
    ids.add(entity.id);
    if (ids.size > ASSET_LIMITS.nodes) reject('$', 'entity-budget');
  }
  function registerLibrary(value: Library): void {
    value.bookmarks.forEach(register);
    value.folders.forEach(register);
    for (const folder of value.folders) libraryFolderIds.add(folder.id);
  }
  function registerCollection(value: Collection): void {
    register(value);
    for (const section of value.sections) {
      register(section);
      section.items.forEach(register);
    }
  }
  registerLibrary(snapshot.library);
  snapshot.layout.shortcuts.forEach(register);
  snapshot.layout.folders.forEach(register);
  snapshot.layout.dock.forEach(register);
  snapshot.collections.forEach(registerCollection);
  for (const entry of snapshot.trash) {
    register(entry);
    switch (entry.payload.kind) {
      case 'bookmark': register(entry.payload.bookmark); break;
      case 'folder-tree': registerLibrary(entry.payload.library); break;
      case 'collection': registerCollection(entry.payload.collection); break;
    }
  }
  libraryRelations(snapshot.library, '$.library');
  const active = new Set(snapshot.library.bookmarks.map(item => item.id));
  function activeBookmark(bookmarkId: string, path: string): void {
    if (!active.has(bookmarkId)) reject(path, 'active-bookmark-required', 'INVALID_REFERENCE');
  }
  function associations(value: Collection): void {
    for (const section of value.sections) for (const item of section.items) {
      if (item.bookmarkId !== null) activeBookmark(item.bookmarkId, '$.collections.bookmarkId');
    }
  }
  snapshot.collections.forEach(associations);
  const { layout } = snapshot;
  const shortcuts = new Set(layout.shortcuts.map(item => item.id));
  const desktopFolders = new Set(layout.folders.map(item => item.id));
  const owned = new Set<string>();
  function own(id: string, exists: boolean): void {
    if (!exists || owned.has(id)) reject('$.layout', 'missing-or-multiply-owned-desktop-entity', 'INVALID_REFERENCE');
    owned.add(id);
  }
  function uniqueBookmarks(items: { bookmarkId: string }[]): void {
    const bookmarks = new Set<string>();
    for (const item of items) {
      activeBookmark(item.bookmarkId, '$.layout.bookmarkId');
      if (bookmarks.has(item.bookmarkId)) reject('$.layout', 'duplicate-bookmark-pin', 'INVALID_REFERENCE');
      bookmarks.add(item.bookmarkId);
    }
  }
  uniqueBookmarks(layout.shortcuts);
  uniqueBookmarks(layout.dock);
  for (const ref of layout.root) {
    own(ref.id, ref.kind === 'shortcut' ? shortcuts.has(ref.id) : desktopFolders.has(ref.id));
  }
  for (const folder of layout.folders) for (const shortcutId of folder.shortcutIds) {
    own(shortcutId, shortcuts.has(shortcutId));
  }
  if (owned.size !== shortcuts.size + desktopFolders.size) reject('$.layout', 'orphan-desktop-entity', 'INVALID_REFERENCE');
  for (const entry of snapshot.trash) {
    const payload = entry.payload;
    if (payload.kind === 'collection') {
      if (entry.origin !== null) reject('$.trash.origin', 'collection-origin-must-be-null');
      associations(payload.collection);
    } else {
      if (entry.origin === null) reject('$.trash.origin', 'library-origin-required');
      const parentId = entry.origin.parentId;
      if (parentId !== null && ids.has(parentId) && !libraryFolderIds.has(parentId)) {
        reject('$.trash.origin', 'known-parent-must-be-library-folder', 'INVALID_REFERENCE');
      }
      if (payload.kind === 'folder-tree') {
        libraryRelations(payload.library, '$.trash.library');
        const roots = payload.library.root;
        if (roots.length !== 1 || roots[0].kind !== 'folder' || roots[0].id !== payload.rootFolderId) {
          reject('$.trash.library.root', 'single-declared-root-required', 'INVALID_REFERENCE');
        }
        if (payload.library.folders.some(folder => folder.id === entry.origin!.parentId)) {
          reject('$.trash.origin', 'origin-inside-deleted-subtree', 'INVALID_REFERENCE');
        }
      }
    }
  }
}

export function captureJsonInput(value: unknown, maxDepth: number = ASSET_LIMITS.jsonDepth): Result<Json> {
  try {
    // Import trees are nested; stored libraries are flat. Keep the wider budget explicit and bounded.
    if (!Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > ASSET_LIMITS.libraryDepth * 2 + 16) {
      reject('$', 'invalid-depth-budget');
    }
    descriptorBudget(value, maxDepth);
    const captured = structuredClone(value) as Json;
    descriptorBudget(captured, maxDepth);
    if (new TextEncoder().encode(JSON.stringify(captured)).byteLength > ASSET_LIMITS.bytes) {
      reject('$', 'byte-budget');
    }
    return { ok: true, value: captured };
  } catch (error) {
    if (error instanceof ValidationFailure) return { ok: false, error: error.error };
    return { ok: false, error: { code: 'INVALID_INPUT', details: { path: '$', reason: 'unreadable-input' } } };
  }
}

function validate<T>(value: unknown, schema: Check, snapshot: (value: T) => AssetSnapshot): Result<T> {
  const captured = captureJsonInput(value);
  if (!captured.ok) return captured;
  try {
    const typed = captured.value as T;
    schema(typed, '$');
    relations(snapshot(typed));
    return { ok: true, value: typed };
  } catch (error) {
    if (error instanceof ValidationFailure) return { ok: false, error: error.error };
    return { ok: false, error: { code: 'INVALID_INPUT', details: { path: '$', reason: 'unreadable-input' } } };
  }
}

export function validateSnapshot(value: unknown): Result<AssetSnapshot> {
  return validate<AssetSnapshot>(value, snapshotSchema, snapshot => snapshot);
}

export function validateEnvelope(value: unknown): Result<AssetEnvelope> {
  return validate<AssetEnvelope>(value, envelopeSchema, envelope => envelope.snapshot);
}
