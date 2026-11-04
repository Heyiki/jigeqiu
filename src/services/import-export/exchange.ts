import type { AppError, AssetSnapshot, ErrorCode, Id, Library, Result } from '../../domain/assets/model';
import type { Notice } from '../../domain/assets/commands';
import { ASSET_LIMITS, captureJsonInput, validateSnapshot } from '../../domain/assets/validation';
import type { AssetExchange, ImportDocument, ImportNode } from './model';

const requiredFields = ['format', 'schemaVersion', 'scope', 'exportedAt', 'library', 'collections'];
const ignoredFields = new Set([
  'settings', 'searchEngines', 'history', 'recentSearches', 'recentUsed',
  'layout', 'dock', 'categories', 'tags', 'plugins',
]);
const budgetReasons = new Set([
  'json-budget', 'byte-budget', 'dense-bounded-array-required', 'entity-budget', 'library-depth',
]);

function fail(code: ErrorCode, reason: string, path = '$'): Result<never> {
  return { ok: false, error: { code, details: { path, reason } } };
}

function importFailure(error: AppError): Result<never> {
  return { ok: false, error: {
    code: typeof error.details.reason === 'string' && budgetReasons.has(error.details.reason)
      ? 'IMPORT_TOO_LARGE' : 'IMPORT_INVALID',
    details: error.details,
  } };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function timestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function assetSnapshot(library: unknown, collections: unknown): unknown {
  return { library, collections, layout: { shortcuts: [], folders: [], root: [], dock: [] }, trash: [] };
}

export function exportAssets(
  snapshot: AssetSnapshot,
  scope: { kind: 'all' } | { kind: 'collection'; id: Id },
  at: number,
): Result<AssetExchange> {
  if (!timestamp(at)) return fail('INVALID_INPUT', 'timestamp-required', '$.exportedAt');
  const capturedScope = captureJsonInput(scope);
  if (!capturedScope.ok) return capturedScope;
  const selection = capturedScope.value;
  if (!record(selection) ||
    (selection.kind === 'all' ? Object.keys(selection).length !== 1 :
      selection.kind !== 'collection' || Object.keys(selection).length !== 2 ||
      typeof selection.id !== 'string' || !selection.id.trim() || selection.id.length > ASSET_LIMITS.idLength)) {
    return fail('INVALID_INPUT', 'exact-scope-required', '$.scope');
  }
  const validated = validateSnapshot(snapshot);
  if (!validated.ok) return validated;
  let { library, collections } = validated.value;
  if (selection.kind === 'collection') {
    const chosen = collections.find(item => item.id === selection.id);
    if (!chosen) return fail('NOT_FOUND', 'collection-not-found', '$.scope.id');
    library = { bookmarks: [], folders: [], root: [] };
    collections = [chosen];
    for (const section of chosen.sections) for (const item of section.items) item.bookmarkId = null;
  }
  // Check the isolated exchange too: excluded domains must not supply its references.
  const independent = validateSnapshot(assetSnapshot(library, collections));
  if (!independent.ok) return independent;
  const result: AssetExchange = {
    format: 'jigeqiu-assets', schemaVersion: 1,
    scope: selection.kind as AssetExchange['scope'], exportedAt: at,
    library: independent.value.library, collections: independent.value.collections,
  };
  const bounded = captureJsonInput(result);
  if (!bounded.ok) return bounded;
  return { ok: true, value: result };
}

function roots(library: Library): ImportNode[] {
  const bookmarks = new Map(library.bookmarks.map(item => [item.id, item]));
  const folders = new Map(library.folders.map(item => [item.id, item]));
  function node(ref: Library['root'][number]): ImportNode {
    if (ref.kind === 'folder') {
      const folder = folders.get(ref.id)!;
      return { kind: 'folder', sourceId: folder.id, name: folder.name, children: folder.children.map(node) };
    }
    const { id, title, url, icon, notes, keywords } = bookmarks.get(ref.id)!;
    return { kind: 'bookmark', sourceId: id, input: { title, url, icon, notes, keywords } };
  }
  return library.root.map(node);
}

export function parseJson(text: string): Result<ImportDocument> {
  if (typeof text !== 'string') return fail('IMPORT_INVALID', 'text-required');
  if (text.length > ASSET_LIMITS.bytes || new TextEncoder().encode(text).byteLength > ASSET_LIMITS.bytes) {
    return fail('IMPORT_TOO_LARGE', 'byte-budget');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('IMPORT_INVALID', 'malformed-json');
  }
  // Budget ignored fields as well, before discarding any of their contents.
  const captured = captureJsonInput(parsed);
  if (!captured.ok) return importFailure(captured.error);
  const input = captured.value;
  if (!record(input)) return fail('IMPORT_INVALID', 'object-required');
  if (input.version === '1.0.0') return fail('LEGACY_REQUIRES_PREVIEW', 'legacy-conversion-required');
  if (requiredFields.some(field => !Object.hasOwn(input, field))) {
    return fail('IMPORT_INVALID', 'required-fields-missing');
  }
  if (input.format !== 'jigeqiu-assets' || input.schemaVersion !== 1) {
    return fail('UNSUPPORTED_VERSION', 'unknown-format-or-version');
  }
  if (Object.keys(input).some(field => !requiredFields.includes(field) && !ignoredFields.has(field))) {
    return fail('IMPORT_INVALID', 'unknown-field');
  }
  if (!['all', 'collection'].includes(input.scope as string) || !timestamp(input.exportedAt)) {
    return fail('IMPORT_INVALID', 'invalid-exchange-header');
  }
  const notices: Notice[] = Object.keys(input).filter(field => ignoredFields.has(field))
    .map(field => ({ code: 'IGNORED_NON_ASSET_FIELD', details: { field } }));
  const candidate = assetSnapshot(input.library, input.collections);
  let validated = validateSnapshot(candidate);
  let sourceCollections: AssetSnapshot['collections'] | undefined;
  if (!validated.ok && validated.error.code === 'INVALID_REFERENCE') {
    // INVALID_REFERENCE is only emitted after the complete field schema passes.
    // Retain source links for preview; only the validation copy may detach them.
    const source = candidate as AssetSnapshot;
    const detached = structuredClone(source);
    const active = new Set(source.library.bookmarks.map(bookmark => bookmark.id));
    for (const collection of detached.collections) for (const section of collection.sections) {
      for (const item of section.items) {
        if (item.bookmarkId !== null && !active.has(item.bookmarkId)) {
          notices.push({ code: 'MISSING_BOOKMARK_LINK', details: {
            collectionId: collection.id, sectionId: section.id, itemId: item.id, bookmarkId: item.bookmarkId,
          } });
          item.bookmarkId = null;
        }
      }
    }
    validated = validateSnapshot(detached);
    sourceCollections = source.collections;
  }
  if (!validated.ok) return importFailure(validated.error);
  const snapshot = validated.value;
  if (input.scope === 'collection' && (snapshot.library.bookmarks.length || snapshot.library.folders.length ||
    snapshot.library.root.length || snapshot.collections.length !== 1)) {
    return fail('IMPORT_INVALID', 'single-collection-empty-library-required');
  }
  return { ok: true, value: {
    format: 'json', roots: roots(snapshot.library),
    collections: sourceCollections ?? snapshot.collections, notices,
  } };
}
