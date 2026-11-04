import type { AppError, AssetSnapshot, Result } from './model';
import type { AssetCommand, Reduction } from './commands';
import { validateCommand } from './command-validation';
import { validateSnapshot } from './validation';
import { applyLibraryAction } from './library-actions';
import { applyLayoutAction } from './layout-actions';
import { applyCollectionAction } from './collection-actions';
import { applyTrashAction } from './trash-actions';
import type { ActionContext } from './command-context';

class CommandFailure {
  constructor(readonly error: AppError) {}
}

export function reduceCommand(snapshot: AssetSnapshot, command: AssetCommand): Result<Reduction> {
  const input = validateCommand(command);
  if (!input.ok) return input;
  const base = validateSnapshot(snapshot);
  if (!base.ok) return base;
  const usedIds = new Set<string>();
  function register(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && 'id' in value) usedIds.add((value as { id: string }).id);
    Object.values(value).forEach(register);
  }
  register(base.value);
  const affected = new Set<string>();
  const ctx: ActionContext = {
    snapshot: base.value, at: input.value.at, affected,
    reject(code, details = {}) { throw new CommandFailure({ code, details }); },
    claim(id) {
      if (usedIds.has(id)) ctx.reject('ID_COLLISION', { id });
      usedIds.add(id);
    },
  };
  try {
    for (const action of input.value.actions) {
      switch (action.type) {
        case 'desktop.pin': case 'desktop.unpin': case 'desktop.folder.create':
        case 'desktop.folder.rename': case 'desktop.move': case 'desktop.folder.remove':
        case 'dock.pin': case 'dock.unpin': case 'dock.move':
          applyLayoutAction(ctx, action); break;
        case 'collection.save': case 'collection.copy': case 'collection.trash':
          applyCollectionAction(ctx, action); break;
        case 'library.trash': case 'trash.restore': case 'trash.purge':
          applyTrashAction(ctx, action); break;
        default: applyLibraryAction(ctx, action);
      }
      // Every action must leave a valid graph, even if a later action deletes it.
      const checked = validateSnapshot(ctx.snapshot);
      if (!checked.ok) return checked;
    }
    const checked = validateSnapshot(ctx.snapshot);
    if (!checked.ok) return checked;
    return { ok: true, value: { next: checked.value, affectedIds: [...affected], notices: [] } };
  } catch (error) {
    return error instanceof CommandFailure ? { ok: false, error: error.error }
      : { ok: false, error: { code: 'INVALID_INPUT', details: { reason: 'invalid-action' } } };
  }
}
