import type {
  AppError, AssetSnapshot, Bookmark, Collection, ErrorCode, Json, LibraryRef, Result,
} from '../../domain/assets/model';
import { ASSET_LIMITS, captureJsonInput, validateSnapshot } from '../../domain/assets/validation';
import type {
  IdMapping, ImportContext, ImportDocument, ImportNode, ImportOptions, ImportPreview, MappingKind,
} from './model';

class PreviewFailure {
  constructor(readonly error: AppError) {}
}
function reject(code: ErrorCode, reason: string, details: Record<string, Json> = {}): never {
  throw new PreviewFailure({ code, details: { reason, ...details } });
}
function requireValue<T>(result: Result<T>): T {
  if (!result.ok) throw new PreviewFailure(result.error);
  return result.value;
}
function captureImportJson(value: unknown): Json {
  const captured = captureJsonInput(value, ASSET_LIMITS.libraryDepth * 2 + 16);
  if (!captured.ok && (captured.error.details.reason === 'byte-budget'
    || captured.error.details.reason === 'json-budget')) {
    throw new PreviewFailure({ ...captured.error, code: 'IMPORT_TOO_LARGE' });
  }
  return requireValue(captured);
}
type Check = (value: unknown) => boolean;
const record: Check = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const id: Check = v => typeof v === 'string' && !!v.trim() && v.length <= ASSET_LIMITS.idLength;
const title: Check = v => typeof v === 'string' && v.length <= ASSET_LIMITS.titleLength;
const integer: Check = v => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const choice = (...values: string[]): Check => v => typeof v === 'string' && values.includes(v);
const nullable = (check: Check): Check => v => v === null || check(v);
const list = (check: Check): Check => v => Array.isArray(v) && v.length <= ASSET_LIMITS.arrayLength && v.every(check);
function shape(fields: Record<string, Check>): Check {
  return v => record(v) && Object.keys(v as object).length === Object.keys(fields).length
    && Object.entries(fields).every(([key, check]) => Object.hasOwn(v as object, key)
      && check((v as Record<string, unknown>)[key]));
}
const revision = shape({ storeId: id, commitId: id, revision: v => integer(v) && (v as number) > 0 });
const optionsSchema = shape({
  target: v => shape({ kind: choice('existing'), folderId: nullable(id) })(v)
    || shape({ kind: choice('new-container'), name: title })(v),
  duplicateBookmarks: choice('skip', 'keep'), duplicateCollections: choice('skip-identical', 'keep'),
  folderBindings: list(shape({ sourceId: id, existingId: id })),
  missingParents: choice('reject', 'root'), missingBookmarkLinks: choice('reject', 'detach'),
});
const contextSchema = shape({
  base: record, expected: nullable(revision), previewId: id, at: integer, candidateIds: list(id),
});

function emptySnapshot(): AssetSnapshot {
  return { library: { bookmarks: [], folders: [], root: [] },
    layout: { shortcuts: [], folders: [], root: [], dock: [] }, collections: [], trash: [] };
}
function normalizeUrl(raw: string): string {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) {
    if (/^[a-z][a-z\d+.-]*:/i.test(url) && !/^[^/:?#]+:\d+(?:[/?#]|$)/.test(url)) {
      reject('INVALID_URL', 'http-https-url-required');
    }
    url = `https://${url}`;
  }
  // The asset validator performs the full protocol, whitespace and length checks.
  return url;
}

function validateDocument(document: ImportDocument): number {
  if (!shape({ format: choice('html', 'json'), roots: list(record), collections: list(record),
    notices: list(shape({ code: id, details: record })) })(document)) {
    reject('IMPORT_INVALID', 'invalid-document');
  }
  const source = emptySnapshot();
  const ids = new Set<string>();
  function register(sourceId: string): void {
    if (!id(sourceId)) reject('IMPORT_INVALID', 'invalid-source-id');
    if (ids.has(sourceId)) reject('ID_COLLISION', 'duplicate-source-id', { sourceId });
    ids.add(sourceId);
    if (ids.size > ASSET_LIMITS.nodes) reject('IMPORT_TOO_LARGE', 'source-entity-budget');
  }
  function visit(node: ImportNode, refs: LibraryRef[], depth: number): void {
    register(node.sourceId);
    if (node.kind === 'folder') {
      if (!shape({ kind: choice('folder'), sourceId: id, name: title, children: list(record) })(node)) {
        reject('IMPORT_INVALID', 'invalid-folder');
      }
      if (depth >= ASSET_LIMITS.libraryDepth) reject('IMPORT_TOO_LARGE', 'library-depth');
      const children: LibraryRef[] = [];
      source.library.folders.push({ id: node.sourceId, name: node.name, children, createdAt: 0, updatedAt: 0 });
      refs.push({ kind: 'folder', id: node.sourceId });
      node.children.forEach(child => visit(child, children, depth + 1));
    } else {
      if (!shape({ kind: choice('bookmark'), sourceId: id, input: shape({
        title, url: v => typeof v === 'string', icon: v => v === null || record(v),
        notes: v => typeof v === 'string', keywords: list(v => typeof v === 'string'),
      }) })(node)) reject('IMPORT_INVALID', 'invalid-bookmark');
      source.library.bookmarks.push({
        ...node.input, url: normalizeUrl(node.input.url), id: node.sourceId, createdAt: 0, updatedAt: 0,
      });
      refs.push({ kind: 'bookmark', id: node.sourceId });
    }
  }
  document.roots.forEach(node => visit(node, source.library.root, 0));
  source.collections = structuredClone(document.collections);
  for (const c of source.collections) {
    register(c.id);
    if (!Array.isArray(c.sections)) reject('IMPORT_INVALID', 'invalid-sections');
    for (const section of c.sections) {
      register(section.id);
      if (!Array.isArray(section.items)) reject('IMPORT_INVALID', 'invalid-items');
      for (const item of section.items) {
        register(item.id);
        if (!nullable(id)(item.bookmarkId)) reject('IMPORT_INVALID', 'invalid-bookmark-link');
        // Validate independent body first; association policy is applied after library mapping.
        item.bookmarkId = null;
      }
    }
  }
  requireValue(validateSnapshot(source));
  let invalid = 0;
  if (document.format === 'html') for (const notice of document.notices) {
    if (notice.code !== 'INVALID_HTML_BOOKMARK') continue;
    if (!shape({
      sourceId: id,
      url: v => typeof v === 'string' && v.length <= ASSET_LIMITS.bytes,
      reason: v => typeof v === 'string' && !!v.trim() && v.length <= ASSET_LIMITS.titleLength,
    })(notice.details)) reject('IMPORT_INVALID', 'invalid-html-rejection-notice');
    register(notice.details.sourceId as string);
    invalid++;
  }
  return invalid;
}

function snapshotIds(snapshot: AssetSnapshot): Set<string> {
  const ids = new Set<string>();
  function visit(value: unknown): void {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value !== null && typeof value === 'object') {
      const object = value as Record<string, unknown>;
      if (typeof object.id === 'string') ids.add(object.id);
      Object.values(object).forEach(visit);
    }
  }
  visit(snapshot);
  return ids;
}

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => sameJson(v, b[i]));
  if (!record(a) || !record(b)) return false;
  const left = a as Record<string, unknown>; const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every(key => Object.hasOwn(right, key) && sameJson(left[key], right[key]));
}
function collectionBody(c: Collection): unknown {
  return {
    title: c.title, description: c.description, cover: c.cover, provenance: c.provenance,
    sections: c.sections.map(s => ({
      title: s.title, description: s.description,
      items: s.items.map(i => ({
        title: i.title, url: i.url, icon: i.icon, recommendationReason: i.recommendationReason,
      })),
    })),
  };
}

export function previewImport(
  document: ImportDocument, options: ImportOptions, context: ImportContext,
): Result<ImportPreview> {
  try {
    const packet = captureImportJson({ document, options, context }) as unknown as {
        document: ImportDocument; options: ImportOptions; context: ImportContext;
      };
    document = packet.document; options = packet.options; context = packet.context;
    if (!optionsSchema(options) || !contextSchema(context)) reject('INVALID_INPUT', 'invalid-options-or-context');
    if (context.expected?.commitId === context.previewId) reject('INVALID_INPUT', 'reused-commit-id');
    const next = requireValue(validateSnapshot(context.base));
    const invalid = validateDocument(document);
    const notices = structuredClone(document.notices);
    const mappings: IdMapping[] = [];
    const counts = { created: 0, skipped: 0, invalid };
    const usedIds = snapshotIds(next);
    const initialIds = new Set(usedIds);
    const initialFolders = new Set(next.library.folders.map(f => f.id));
    const folders = new Map(next.library.folders.map(f => [f.id, f]));
    const bookmarks = new Map(next.library.bookmarks.map(b => [b.id, b]));
    const mappedBookmarks = new Map<string, string>();
    let cursor = 0;
    function allocate(): string {
      if (cursor >= context.candidateIds.length) reject('IMPORT_INVALID', 'candidate-id-exhausted');
      const id = context.candidateIds[cursor++];
      if (usedIds.has(id)) reject('ID_COLLISION', 'candidate-id-collision', { id });
      usedIds.add(id); counts.created++;
      return id;
    }
    function map(kind: MappingKind, sourceId: string, targetId: string, existing: boolean): void {
      mappings.push({ kind, sourceId, targetId, disposition: existing ? 'existing' : 'created' });
      // Every reused entity mapping counts as skipped, including bound folders and nested collection entities.
      if (existing) counts.skipped++;
    }
    function container(parentId: string | null): LibraryRef[] {
      return parentId === null ? next.library.root : folders.get(parentId)!.children;
    }
    function append(parentId: string | null, ref: LibraryRef): void {
      container(parentId).push(ref);
      if (parentId !== null) folders.get(parentId)!.updatedAt = context.at;
    }
    const duplicateIndexes = new Map<string | null, Map<string, Bookmark[]>>();
    function duplicateIndex(parentId: string | null): Map<string, Bookmark[]> {
      let index = duplicateIndexes.get(parentId);
      if (!index) {
        index = new Map();
        for (const ref of container(parentId)) {
          if (ref.kind !== 'bookmark') continue;
          const bookmark = bookmarks.get(ref.id)!;
          const key = new URL(bookmark.url).href;
          const matches = index.get(key) ?? [];
          matches.push(bookmark); index.set(key, matches);
        }
        duplicateIndexes.set(parentId, index);
      }
      return index;
    }
    function createFolder(name: string, parentId: string | null): string {
      const id = allocate();
      const folder = { id, name, children: [] as LibraryRef[], createdAt: context.at, updatedAt: context.at };
      next.library.folders.push(folder); folders.set(id, folder);
      append(parentId, { kind: 'folder', id });
      return id;
    }
    let parentId: string | null = null;
    if (options.target.kind === 'existing') {
      parentId = options.target.folderId;
      if (parentId !== null && !initialFolders.has(parentId)) {
        if (initialIds.has(parentId) || options.missingParents === 'reject') {
          reject('INVALID_REFERENCE', 'missing-target-folder', { folderId: parentId });
        }
        notices.push({ code: 'IMPORT_PARENT_ROOT', details: { folderId: parentId } });
        parentId = null;
      }
    } else parentId = createFolder(options.target.name, null);

    const bindings = new Map<string, string>();
    const boundTargets = new Set<string>();
    for (const binding of options.folderBindings) {
      if (bindings.has(binding.sourceId) || boundTargets.has(binding.existingId) || !initialFolders.has(binding.existingId)) {
        reject('INVALID_REFERENCE', 'invalid-folder-binding', { sourceId: binding.sourceId, existingId: binding.existingId });
      }
      bindings.set(binding.sourceId, binding.existingId); boundTargets.add(binding.existingId);
    }
    const visitedBindings = new Set<string>();
    function visit(node: ImportNode, parentId: string | null): void {
      if (node.kind === 'folder') {
        let targetId = bindings.get(node.sourceId);
        const existing = targetId !== undefined;
        if (targetId !== undefined) {
          if (!container(parentId).some(ref => ref.kind === 'folder' && ref.id === targetId)) {
            reject('INVALID_REFERENCE', 'binding-parent-mismatch', { sourceId: node.sourceId, existingId: targetId });
          }
          visitedBindings.add(node.sourceId);
        } else targetId = createFolder(node.name, parentId);
        map('folder', node.sourceId, targetId, existing);
        node.children.forEach(child => visit(child, targetId));
      } else {
        const url = normalizeUrl(node.input.url);
        const index = options.duplicateBookmarks === 'skip' ? duplicateIndex(parentId) : undefined;
        const key = new URL(url).href;
        const matches = index?.get(key) ?? [];
        let targetId: string;
        if (matches.length) {
          targetId = matches[0].id;
          notices.push({ code: 'IMPORT_BOOKMARK_SKIPPED', details: {
            sourceId: node.sourceId, targetId, candidateIds: matches.map(b => b.id),
            differences: matches.map(b => ({
              targetId: b.id, title: b.title !== node.input.title, url: b.url !== url,
              icon: !sameJson(b.icon, node.input.icon), notes: b.notes !== node.input.notes,
              keywords: !sameJson(b.keywords, node.input.keywords),
            })),
          } });
        } else {
          targetId = allocate();
          const bookmark = { ...structuredClone(node.input), url, id: targetId, createdAt: context.at, updatedAt: context.at };
          next.library.bookmarks.push(bookmark); bookmarks.set(targetId, bookmark);
          append(parentId, { kind: 'bookmark', id: targetId });
          index?.set(key, [bookmark]);
        }
        map('bookmark', node.sourceId, targetId, matches.length > 0);
        mappedBookmarks.set(node.sourceId, targetId);
      }
    }
    document.roots.forEach(node => visit(node, parentId));
    if (visitedBindings.size !== bindings.size) reject('INVALID_REFERENCE', 'binding-source-not-folder');

    for (const source of document.collections) {
      const copy = structuredClone(source);
      for (const section of copy.sections) for (const item of section.items) {
        if (item.bookmarkId === null) continue;
        const mapped = mappedBookmarks.get(item.bookmarkId);
        if (mapped !== undefined) item.bookmarkId = mapped;
        else {
          const details = { collectionId: source.id, sectionId: section.id, itemId: item.id, bookmarkId: item.bookmarkId };
          if (options.missingBookmarkLinks === 'reject') reject('INVALID_REFERENCE', 'unresolved-bookmark-link', details);
          notices.push({ code: 'IMPORT_BOOKMARK_LINK_DETACHED', details });
          item.bookmarkId = null;
        }
      }
      const existing = options.duplicateCollections === 'skip-identical'
        ? next.collections.find(c => sameJson(collectionBody(c), collectionBody(source))) : undefined;
      if (existing) {
        map('collection', source.id, existing.id, true);
        source.sections.forEach((section, si) => {
          map('section', section.id, existing.sections[si].id, true);
          section.items.forEach((item, ii) => map('item', item.id, existing.sections[si].items[ii].id, true));
        });
      } else {
        copy.id = allocate(); map('collection', source.id, copy.id, false);
        copy.createdAt = context.at; copy.updatedAt = context.at;
        copy.sections.forEach((section, si) => {
          section.id = allocate(); map('section', source.sections[si].id, section.id, false);
          section.items.forEach((item, ii) => {
            item.id = allocate(); map('item', source.sections[si].items[ii].id, item.id, false);
          });
        });
        next.collections.push(copy);
      }
    }
    const validated = requireValue(validateSnapshot(next));
    const preview: ImportPreview = {
      previewId: context.previewId, expected: context.expected, document, options,
      mappings, next: validated, counts, notices,
    };
    return { ok: true, value: captureImportJson(preview) as unknown as ImportPreview };
  } catch (error) {
    return { ok: false, error: error instanceof PreviewFailure ? error.error
      : { code: 'IMPORT_INVALID', details: { reason: 'invalid-import-input' } } };
  }
}
