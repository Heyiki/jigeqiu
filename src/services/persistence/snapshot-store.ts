import type { AssetEnvelope, AssetSnapshot, ErrorCode, Id, Result, Revision } from '../../domain/assets/model';
import { validateEnvelope, validateSnapshot } from '../../domain/assets/validation';
import type { AssetCommand, AssetService, CommitReceipt, Reduction } from '../../domain/assets/commands';
import { reduceCommand } from '../../domain/assets/reducer';
import { validateCommand } from '../../domain/assets/command-validation';

export const ASSET_KEY = 'jigeqiu_assets_v1';
export const PERSISTENCE_LOCK = 'jigeqiu:m1:persistence';

export type ReadState =
  | { kind: 'empty' }
  | { kind: 'ready'; envelope: AssetEnvelope }
  | { kind: 'legacy'; raw: Record<string, string | null> };
export type WriteCapability =
  | { mode: 'web-locks' }
  | { mode: 'read-only'; reason: 'LOCK_UNAVAILABLE' };
export interface SnapshotChange { version: Revision | null; requiresReload: boolean }
export interface SnapshotStore extends AssetService {
  capability(): WriteCapability;
  read(): Promise<Result<ReadState>>;
  readRaw(): Result<string | null>;
  commit(expected: Revision | null, next: AssetSnapshot, commandId: Id, at: number): Promise<Result<AssetEnvelope>>;
  subscribe(listener: (change: SnapshotChange) => void): () => void;
}
export interface CommitCoordinator {
  runExclusive<T>(name: string, task: () => Promise<T>): Promise<T>;
}
export interface ChangeSource { subscribe(listener: () => void): () => void }
export interface SnapshotStoreOptions {
  storage: () => Storage;
  locks: CommitCoordinator | null;
  newStoreId: () => Id;
  changes?: ChangeSource;
}

function failure<T>(code: ErrorCode): Result<T> {
  return { ok: false, error: { code, details: {} } };
}

function isRevision(value: unknown): value is Revision {
  if (!value || typeof value !== 'object') return false;
  const revision = value as Revision;
  return Object.keys(value).length === 3
    && validId(revision.storeId) && validId(revision.commitId)
    && Number.isSafeInteger(revision.revision) && revision.revision > 0;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
}

function sameRevision(left: Revision | null, right: Revision | null): boolean {
  return left === null || right === null ? left === right
    : left.storeId === right.storeId && left.revision === right.revision && left.commitId === right.commitId;
}

/** No eager browser access, defaults, migration, or writes on read. */
export function createSnapshotStore(options: SnapshotStoreOptions): SnapshotStore {
  let lockUnavailable = options.locks === null;
  let uncertain = false;
  const listeners = new Set<(change: SnapshotChange) => void>();
  let unsubscribeChanges: (() => void) | undefined;

  function publish(change: SnapshotChange): void {
    for (const listener of listeners) {
      try {
        listener({ ...change, version: change.version ? { ...change.version } : null });
      } catch {
        // A view failure must never change the outcome of an already persisted save.
      }
    }
  }

  function load(storage: Storage): Result<ReadState> {
    try {
      const raw = storage.getItem(ASSET_KEY);
      if (raw !== null) {
        let value: unknown;
        try { value = JSON.parse(raw); } catch { return failure('CORRUPT_DATA'); }
        if (value && typeof value === 'object'
          && (value as AssetEnvelope).format === 'jigeqiu-local-assets'
          && (value as AssetEnvelope).schemaVersion !== 1) {
          return failure('UNSUPPORTED_VERSION');
        }
        const parsed = validateEnvelope(value);
        if (!parsed.ok) return failure('CORRUPT_DATA');
        return { ok: true, value: { kind: 'ready', envelope: parsed.value } };
      }
      const legacy: Record<string, string | null> = {};
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (key && /^jipage_.+_v1$/.test(key)) legacy[key] = storage.getItem(key);
      }
      return {
        ok: true,
        value: Object.keys(legacy).length ? { kind: 'legacy', raw: legacy } : { kind: 'empty' },
      };
    } catch {
      return failure('STORAGE_UNAVAILABLE');
    }
  }

  async function read(): Promise<Result<ReadState>> {
    try { return load(options.storage()); } catch { return failure('STORAGE_UNAVAILABLE'); }
  }

  async function invalidate(): Promise<void> {
    const result = await read();
    publish({
      version: result.ok && result.value.kind === 'ready' ? result.value.envelope.version : null,
      requiresReload: true,
    });
  }

  async function save(
    expected: Revision | null, next: AssetSnapshot | null, commandId: Id, at: number,
    command?: AssetCommand,
  ): Promise<Result<CommitReceipt>> {
    if (uncertain) return failure('COMMIT_UNCERTAIN');
    if (lockUnavailable || !options.locks) return failure('LOCK_UNAVAILABLE');

    // Capture confirmed input before queuing; callers may keep editing their draft.
    let snapshot: AssetSnapshot | undefined;
    let reduction: Reduction | undefined;
    let base: Revision | null;
    try {
      if ((expected !== null && !isRevision(expected)) || !validId(commandId)
        || !Number.isSafeInteger(at) || at < 0) return failure('INVALID_INPUT');
      if (!command) {
        const validation = validateSnapshot(next);
        if (!validation.ok) return validation;
        snapshot = validation.value;
      }
      base = expected === null ? null : { ...expected };
    } catch {
      return failure('INVALID_INPUT');
    }

    let receipt: Result<AssetEnvelope>;
    try {
      receipt = await options.locks.runExclusive(PERSISTENCE_LOCK, async (): Promise<Result<AssetEnvelope>> => {
        if (uncertain) return failure('COMMIT_UNCERTAIN');
        let storage: Storage;
        try { storage = options.storage(); } catch { return failure('STORAGE_UNAVAILABLE'); }
        const current = load(storage);
        if (!current.ok) return current;
        if (current.value.kind === 'legacy') return failure('LEGACY_REQUIRES_PREVIEW');
        const version = current.value.kind === 'ready' ? current.value.envelope.version : null;
        if (!sameRevision(base, version)) return failure('CONFLICT');
        if (version && (version.revision === Number.MAX_SAFE_INTEGER || version.commitId === commandId)) {
          return failure('INVALID_INPUT');
        }
        if (command) {
          const initial: AssetSnapshot = current.value.kind === 'ready' ? current.value.envelope.snapshot : {
            library: { bookmarks: [], folders: [], root: [] },
            layout: { shortcuts: [], folders: [], root: [], dock: [] }, collections: [], trash: [],
          };
          const result = reduceCommand(initial, command);
          if (!result.ok) return result;
          reduction = result.value;
          snapshot = result.value.next;
        }
        let envelope: AssetEnvelope;
        let serialized: string;
        try {
          envelope = {
            format: 'jigeqiu-local-assets', schemaVersion: 1,
            version: {
              storeId: version?.storeId ?? options.newStoreId(),
              revision: (version?.revision ?? 0) + 1,
              commitId: commandId,
            },
            committedAt: at, snapshot: snapshot!,
          };
          const validated = validateEnvelope(envelope);
          if (!validated.ok) return validated;
          serialized = JSON.stringify(envelope);
        } catch {
          return failure('INVALID_INPUT');
        }
        try {
          storage.setItem(ASSET_KEY, serialized);
        } catch (error) {
          return failure(error && typeof error === 'object' && 'name' in error && error.name === 'QuotaExceededError'
            ? 'QUOTA_EXCEEDED' : 'STORAGE_WRITE_FAILED');
        }
        try {
          if (storage.getItem(ASSET_KEY) !== serialized) throw new Error('Write not verified');
        } catch {
          uncertain = true;
          return failure('COMMIT_UNCERTAIN');
        }
        return { ok: true, value: envelope };
      });
    } catch {
      lockUnavailable = true;
      return failure('LOCK_UNAVAILABLE');
    }
    // Notify after releasing the lock so a listener can schedule another command.
    if (receipt.ok) publish({ version: receipt.value.version, requiresReload: false });
    else if (uncertain) publish({ version: null, requiresReload: true });
    return receipt.ok ? {
      ok: true, value: { envelope: receipt.value, affectedIds: reduction?.affectedIds ?? [], notices: reduction?.notices ?? [] },
    } : receipt;
  }

  const store: SnapshotStore = {
    capability: () => lockUnavailable
      ? { mode: 'read-only', reason: 'LOCK_UNAVAILABLE' } : { mode: 'web-locks' },
    read,
    readRaw() {
      try { return { ok: true, value: options.storage().getItem(ASSET_KEY) }; }
      catch { return failure('STORAGE_UNAVAILABLE'); }
    },
    async execute(command) {
      const captured = validateCommand(command);
      if (!captured.ok) return captured;
      const input = captured.value;
      return save(input.expected, null, input.commandId, input.at, input);
    },
    async commit(expected, next, commandId, at) {
      const result = await save(expected, next, commandId, at);
      return result.ok ? { ok: true, value: result.value.envelope } : result;
    },
    subscribe(listener) {
      listeners.add(listener);
      if (!unsubscribeChanges && options.changes) {
        try {
          unsubscribeChanges = options.changes.subscribe(() => { void invalidate(); });
        } catch (error) {
          listeners.delete(listener);
          throw error;
        }
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          unsubscribeChanges?.();
          unsubscribeChanges = undefined;
        }
      };
    },
  };
  return store;
}
