import { createExtensionStorage } from './local';
import { DEFAULT_USER_SETTINGS } from '../../src/data/defaultData';
import { readBookmarkBar, projectBookmarkBar, commitBookmarkBar,
  type BarSnapshot, type BookmarksAPI, type BrowserBookmarkState, type BrowserLibrary } from '../bookmarks/model';
import type { BookmarkSource, BookmarkSourcePlatform, BookmarkSourceProblem } from '../../src/services/bookmark-source-platform';

export const SOURCE_KEY = 'jipage_bookmark_source_v1';
export const BROWSER_LIBRARY_KEY = 'jipage_browser_library_v1';
const IDS_KEY = 'jipage_browser_bookmark_ids_v1';
const SIGNATURE_KEY = 'jipage_browser_bookmark_signature_v1';
const ROOT_KEY = 'jipage_browser_bookmark_root_v1';
const LIBRARY_KEY = 'jipage_library_v2';
const SETTINGS_KEY = 'jipage_settings_v1';
const SCOPED = new Set(['jipage_bookmarks_v1', 'jipage_folders_v1', 'jipage_collections_v1', 'jipage_recent_used_v1', 'jipage_submissions_v1']);
interface EventSource { addListener(listener: () => void): void }
export interface SourceChrome {
  bookmarks: BookmarksAPI & {
    onCreated: EventSource; onChanged: EventSource; onRemoved: EventSource;
    onMoved: EventSource; onChildrenReordered: EventSource; onImportEnded: EventSource;
  };
  permissions: {
    contains(details: { permissions: string[] }): Promise<boolean>;
    request(details: { permissions: string[] }): Promise<boolean>;
    onRemoved: EventSource; onAdded: EventSource;
  };
}
type Dependencies = Parameters<typeof createExtensionStorage>[0] & { chrome: SourceChrome };
const selected = (data: Record<string, string>): BookmarkSource => data[SOURCE_KEY] === 'browser' ? 'browser' : 'extension';

export function createBookmarkSourceStorage(deps: Dependencies) {
  let openedSource: BookmarkSource = 'extension';
  let switching = false;
  let problem: BookmarkSourceProblem | undefined;
  let snapshot: BarSnapshot | undefined;
  let browserState: BrowserBookmarkState | undefined;
  let queued = false;
  let dirty = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  const setProblem = (next: BookmarkSourceProblem | undefined) => { if (problem !== next) { problem = next; notify(); } };
  const store = (data: Record<string, string>, state: BrowserBookmarkState, current: BarSnapshot) => {
    data[BROWSER_LIBRARY_KEY] = JSON.stringify(state.library);
    data[IDS_KEY] = JSON.stringify(state.ids);
    data[SIGNATURE_KEY] = current.signature;
    data[ROOT_KEY] = current.root.id;
  };
  const loadBrowser = async (data: Record<string, string>) => {
    if (!await deps.chrome.permissions.contains({ permissions: ['bookmarks'] })) {
      setProblem('permission');
      throw new Error('BOOKMARK_PERMISSION_REQUIRED');
    }
    snapshot = await readBookmarkBar(deps.chrome.bookmarks, data[ROOT_KEY]);
    const previous: BrowserBookmarkState | undefined = data[BROWSER_LIBRARY_KEY] ? {
      library: JSON.parse(data[BROWSER_LIBRARY_KEY]), ids: JSON.parse(data[IDS_KEY] ?? '{}'),
    } : undefined;
    browserState = previous && data[SIGNATURE_KEY] === snapshot.signature
      ? previous : projectBookmarkBar(snapshot, previous);
    store(data, browserState, snapshot);
    setProblem(undefined);
  };
  const base = createExtensionStorage({
    ...deps,
    async prepare(data) {
      if (switching) return;
      if (selected(data) !== openedSource) { setProblem('changed'); throw new Error('CONFLICT'); }
      if (openedSource === 'browser') await loadBrowser(data);
    },
    async beforeCommit(before, next) {
      if (switching) {
        if (selected(next) === 'browser') await loadBrowser(next);
        return false;
      }
      if (openedSource !== 'browser' || before[BROWSER_LIBRARY_KEY] === next[BROWSER_LIBRARY_KEY]) return false;
      // Clearing the application's data must never silently clear a native bookmark bar.
      if (!next[BROWSER_LIBRARY_KEY]) throw new Error('BROWSER_RESET_UNSUPPORTED');
      const desired = JSON.parse(next[BROWSER_LIBRARY_KEY]) as BrowserLibrary;
      const committed = await commitBookmarkBar(deps.chrome.bookmarks, snapshot!, browserState!, desired);
      store(next, committed, committed.snapshot);
      return committed.snapshot.signature !== snapshot!.signature;
    },
  });
  const route = (key: string) => openedSource !== 'browser' ? key
    : key === LIBRARY_KEY ? BROWSER_LIBRARY_KEY : SCOPED.has(key) ? key.replace('jipage_', 'jipage_browser_') : key;
  const storage: Storage = {
    get length() { return base.storage.length; },
    key: index => base.storage.key(index),
    getItem(key) {
      if (openedSource === 'browser' && key === SETTINGS_KEY) {
        const saved = JSON.parse(base.storage.getItem(key) ?? '{}');
        const library = JSON.parse(base.storage.getItem(BROWSER_LIBRARY_KEY) ?? '{}');
        return JSON.stringify({ ...saved, dockBookmarkIds: library.dockBookmarkIds ?? [] });
      }
      return base.storage.getItem(route(key));
    },
    setItem(key, value) {
      if (openedSource === 'browser' && key === SETTINGS_KEY) {
        const original = JSON.parse(base.storage.getItem(key) ?? '{}');
        const next = JSON.parse(value);
        // Keep the incoming key position so the virtual settings round-trip exactly.
        // An unset extension Dock still means its defaults, never the browser Dock.
        next.dockBookmarkIds = original.dockBookmarkIds ?? DEFAULT_USER_SETTINGS.dockBookmarkIds;
        base.storage.setItem(key, JSON.stringify(next));
      } else base.storage.setItem(route(key), value);
    },
    removeItem(key) { base.storage.removeItem(route(key)); },
    clear() {
      if (openedSource === 'browser') throw new Error('BROWSER_RESET_UNSUPPORTED');
      base.storage.clear();
    },
  };
  const refresh = async () => {
    try { await base.mutate(() => {}); }
    catch (cause) {
      if (cause instanceof Error && cause.message === 'COMMIT_UNCERTAIN') setProblem('uncertain');
      else if (problem !== 'changed' && problem !== 'permission') setProblem('unavailable');
      throw cause;
    }
  };
  const schedule = () => {
    if (openedSource !== 'browser' || switching || problem === 'changed') return;
    dirty = true;
    if (queued) return;
    queued = true;
    // Drain events arriving during a read too, so the last native change is never lost.
    queueMicrotask(async () => {
      try {
        do {
          dirty = false;
          await refresh().catch(() => {});
        } while (dirty && problem !== 'changed');
      } finally { queued = false; }
    });
  };
  const driver = {
    storage,
    source: () => openedSource,
    problem: () => problem,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async initialize() {
      await base.initialize();
      openedSource = base.storage.getItem(SOURCE_KEY) === 'browser' ? 'browser' : 'extension';
      if (openedSource === 'browser') await refresh().catch(() => {});
      for (const event of ['onCreated', 'onChanged', 'onRemoved', 'onMoved', 'onChildrenReordered', 'onImportEnded'] as const) {
        deps.chrome.bookmarks?.[event]?.addListener(schedule);
      }
      deps.chrome.permissions?.onRemoved?.addListener(schedule);
      deps.chrome.permissions?.onAdded?.addListener(schedule);
      if (typeof window !== 'undefined') window.addEventListener('focus', schedule);
      deps.changes.addListener((changes, area) => {
        if (area !== 'local' || switching) return;
        // The underlying driver publishes changes first. Recheck even when leaving browser mode.
        try {
          if (Object.keys(changes).length
            && (base.storage.getItem(SOURCE_KEY) === 'browser' ? 'browser' : 'extension') !== openedSource) setProblem('changed');
        } catch (cause) {
          setProblem(cause instanceof Error && cause.message === 'COMMIT_UNCERTAIN' ? 'uncertain' : 'unavailable');
        }
      });
    },
    async mutate<T>(action: () => T): Promise<T> {
      try { return await base.mutate(action); }
      catch (cause) {
        if (cause instanceof Error && cause.message === 'COMMIT_UNCERTAIN') setProblem('uncertain');
        throw cause;
      }
    },
    async switchSource(next: BookmarkSource) {
      if (next !== 'extension' && next !== 'browser') throw new Error('INVALID_INPUT');
      // This must be the first asynchronous call to preserve the user's click gesture.
      if (next === 'browser' && !await deps.chrome.permissions.request({ permissions: ['bookmarks'] })) throw new Error('BOOKMARK_PERMISSION_REQUIRED');
      switching = true;
      try {
        await base.mutate(() => base.storage.setItem(SOURCE_KEY, next));
      } finally { switching = false; }
      setProblem('changed');
    },
    refresh,
  } satisfies BookmarkSourcePlatform & { storage: Storage; initialize(): Promise<void>; mutate<T>(action: () => T): Promise<T>; refresh(): Promise<void> };
  return driver;
}
