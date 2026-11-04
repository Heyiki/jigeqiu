import type { AssetSnapshot, Result, Revision } from '../../domain/assets/model';
import { ASSET_LIMITS, captureJsonInput } from '../../domain/assets/validation';
import type { SnapshotStore } from '../persistence/snapshot-store';
import { parseJson } from './exchange';
import type {
  ImportContext, ImportDocument, ImportOptions, ImportPreview, ImportReport, JsonImportService,
} from './model';
import { previewImport } from './preview';

interface PreviewTicket {
  document: ImportDocument;
  options: ImportOptions;
  context: ImportContext;
  preview: ImportPreview;
}
const IMPORT_CAPTURE_DEPTH = ASSET_LIMITS.libraryDepth * 2 + 16;

function failure<T>(code: 'IMPORT_INVALID' | 'PREVIEW_STALE' | 'LEGACY_REQUIRES_PREVIEW'): Result<T> {
  return { ok: false, error: { code, details: {} } };
}

function commitInProgress<T>(): Result<T> {
  return { ok: false, error: { code: 'CONFLICT', details: { reason: 'import-commit-in-progress' } } };
}

// Compare JSON values independent of object insertion order, but retain array order.
function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length
    && keys.every(key => Object.hasOwn(b, key) && sameJson(a[key], b[key]));
}

function emptySnapshot(): AssetSnapshot {
  return {
    library: { bookmarks: [], folders: [], root: [] },
    layout: { shortcuts: [], folders: [], root: [], dock: [] }, collections: [], trash: [],
  };
}

/** One import flow per instance; preview replacement is refused during confirmation. */
export function createJsonImportService(store: SnapshotStore): JsonImportService {
  let active: PreviewTicket | null = null;
  let busy = false;

  async function commit(preview: ImportPreview): Promise<Result<ImportReport>> {
    const ticket = active;
    const captured = captureJsonInput(preview, IMPORT_CAPTURE_DEPTH);
    if (!ticket || !captured.ok || !sameJson(captured.value, ticket.preview)) return failure('IMPORT_INVALID');
    if (busy) return commitInProgress();
    busy = true;

    try {
      const current = await store.read();
      if (!current.ok) return current;
      if (current.value.kind === 'legacy') return failure('LEGACY_REQUIRES_PREVIEW');
      const version: Revision | null = current.value.kind === 'ready' ? current.value.envelope.version : null;
      const base = current.value.kind === 'ready' ? current.value.envelope.snapshot : emptySnapshot();
      if (!sameJson(version, ticket.context.expected) || !sameJson(base, ticket.context.base)) {
        return failure('PREVIEW_STALE');
      }

      // Recompute from retained inputs and the real persisted base, never a caller's candidate.
      const recomputed = previewImport(ticket.document, ticket.options, { ...ticket.context, base });
      if (!recomputed.ok) return recomputed;
      if (!sameJson(recomputed.value, ticket.preview)) return failure('IMPORT_INVALID');
      const result = await store.commit(
        version, recomputed.value.next, ticket.context.previewId, ticket.context.at,
      );
      if (!result.ok) return result.error.code === 'CONFLICT' ? failure('PREVIEW_STALE') : result;
      if (active === ticket) active = null;
      const plan = recomputed.value;
      const affectedIds = new Set(plan.mappings.map(mapping => mapping.targetId));
      if (ticket.options.target.kind === 'new-container') affectedIds.add(ticket.context.candidateIds[0]);
      return {
        ok: true, value: {
          receipt: { envelope: result.value, affectedIds: [...affectedIds], notices: structuredClone(plan.notices) },
          mappings: plan.mappings, counts: plan.counts, notices: plan.notices,
        },
      };
    } finally {
      busy = false;
    }
  }

  return {
    parseJson,
    preview(document, options, context) {
      if (busy) return commitInProgress();
      const captured = captureJsonInput({ document, options, context }, IMPORT_CAPTURE_DEPTH);
      if (!captured.ok) return failure('IMPORT_INVALID');
      const request = captured.value as unknown as Omit<PreviewTicket, 'preview'>;
      const result = previewImport(request.document, request.options, request.context);
      if (!result.ok) return result;
      const confirmed = captureJsonInput(result.value, IMPORT_CAPTURE_DEPTH);
      if (!confirmed.ok) return failure('IMPORT_INVALID');
      active = { ...request, preview: confirmed.value as unknown as ImportPreview };
      return result;
    },
    commit,
  };
}
