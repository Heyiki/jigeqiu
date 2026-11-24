import { useDeferredValue, useMemo, useState, useSyncExternalStore } from 'react';
import { Activity, ChevronDown, ExternalLink, Loader2, Pause, Play, Square } from 'lucide-react';
import type { Bookmark, Folder } from '../../types';
import { createTranslator } from '../../i18n';
import { networkTarget, type HealthCategory } from '../../services/link-health/probe';
import type { LinkHealthController, ScanBookmark } from '../../services/link-health/controller';
import { LINK_HEALTH_ORIGINS, type LinkHealthPlatform } from '../../services/link-health-platform';
import { Modal } from '../common/Modal';
import { Pagination } from '../common/Pagination';
import { FolderTreeSelect } from '../common/FolderTreeSelect';
import { preferenceSaveError } from '../../services/preference-save-error';

const button = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/10';
const selectStyle = 'h-10 w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-9 text-sm text-slate-900 shadow-sm outline-none transition-colors hover:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:light] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:[color-scheme:dark] [&>option]:bg-white [&>option]:text-slate-900 dark:[&>option]:bg-slate-800 dark:[&>option]:text-slate-100';
const categoryStyle: Record<HealthCategory, string> = {
  success: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-200',
  missing: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-400/30 dark:bg-rose-400/15 dark:text-rose-200',
  restricted: 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-400/30 dark:bg-orange-400/15 dark:text-orange-200',
  temporary: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-200',
  unchecked: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-500 dark:bg-slate-700/60 dark:text-slate-200',
};
type PermissionPlan = { entries: ScanBookmark[]; recheck: boolean };

export function LinkHealthView({ controller, platform, bookmarks, folders, language, onTrash }: {
  controller: LinkHealthController; platform?: LinkHealthPlatform;
  bookmarks: Bookmark[]; folders: Folder[]; language?: string;
  onTrash(ids: string[]): Promise<number>;
}) {
  const t = createTranslator(language);
  const scan = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [scope, setScope] = useState('');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [category, setCategory] = useState<Exclude<HealthCategory, 'success'> | 'all'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [permissionPlan, setPermissionPlan] = useState<PermissionPlan | null>(null);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const folderNames = useMemo(() => new Map(folders.map(folder => [folder.id, folder.name])), [folders]);
  const results = useMemo(() => controller.results({ category, query: deferredQuery, page, pageSize }),
    [controller, scan.revision, category, deferredQuery, page, pageSize]);
  const visibleSelection = results.items.filter(row => selected.has(row.bookmark.id)).map(row => row.bookmark.id);
  const active = ['running', 'paused', 'preparing'].includes(scan.state);
  const resetSelection = () => setSelected(new Set());

  async function startPlan(plan: PermissionPlan) {
    resetSelection();
    if (plan.recheck) await controller.recheck(plan.entries.map(entry => entry.id));
    else { setPage(1); await controller.start(plan.entries); }
    controller.setOffline(!navigator.onLine);
  }

  async function prepare(recheck = false) {
    if (!platform || busy) return;
    setBusy(true); setError('');
    try {
      let entries: ScanBookmark[];
      if (recheck) entries = controller.trashCandidates(visibleSelection, bookmarks);
      else {
        const scopeIds = new Set(scope ? [scope] : []);
        if (scope) {
          for (let previous = -1; previous !== scopeIds.size;) {
            previous = scopeIds.size;
            for (const folder of folders) if (folder.parentId && scopeIds.has(folder.parentId)) scopeIds.add(folder.id);
          }
        }
        entries = bookmarks.filter(bookmark => !scope || scopeIds.has(bookmark.folderId ?? ''));
      }
      if (!entries.length) { if (recheck) setError(t('healthStale')); return; }
      const plan = { entries, recheck };
      const grants = await Promise.all(LINK_HEALTH_ORIGINS.map(origin => platform.contains(origin)));
      if (grants.every(Boolean)) await startPlan(plan);
      else setPermissionPlan(plan);
    } catch { setError(t('healthError')); }
    finally { setBusy(false); }
  }

  function authorize() {
    if (!permissionPlan || !platform || busy) return;
    const plan = permissionPlan;
    setBusy(true); setError('');
    // Keep request in the user gesture. Each probe still checks contains even after denial.
    let request: Promise<boolean>;
    try { request = platform.request([...LINK_HEALTH_ORIGINS]); }
    catch { setBusy(false); setError(t('healthError')); return; }
    void request.then(async granted => {
      if (!granted || !(await Promise.all(LINK_HEALTH_ORIGINS.map(origin => platform.contains(origin)))).every(Boolean)) {
        setError(t('healthPermissionDenied'));
        return;
      }
      setPermissionPlan(null);
      await startPlan(plan);
    }).catch(() => setError(t('healthError'))).finally(() => setBusy(false));
  }

  async function trash() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const count = await onTrash(visibleSelection);
      controller.ignore(visibleSelection);
      resetSelection(); setConfirmTrash(false);
      if (count < visibleSelection.length) setError(t('healthStale'));
    } catch (cause) { setError(preferenceSaveError(cause, language, 'library')); }
    finally { setBusy(false); }
  }

  if (!platform) return <p role="status" className="text-sm text-slate-500">{t('healthUnavailable')}</p>;
  return <section className="min-w-0 space-y-4 text-slate-900 dark:text-slate-100" aria-label={t('healthTitle')}>
    <div className="flex items-start gap-3"><Activity size={22} className="mt-0.5 shrink-0 text-sky-600" />
      <div><h2 className="font-semibold">{t('healthTitle')}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('healthDescription')}</p></div>
    </div>
    <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-200">{t('healthMemory')}</p>
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 basis-64">
        <FolderTreeSelect folders={folders} value={scope || undefined} onChange={id => setScope(id ?? '')}
          language={language} label={t('healthScope')} rootLabel={t('healthAllBookmarks')} disabled={active || busy} />
      </div>
      {!active && <button type="button" className={`${button} bg-sky-600 !text-white hover:!bg-sky-700`} disabled={busy || !bookmarks.length} onClick={() => { void prepare(); }}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}{t(scan.state === 'idle' ? 'healthStart' : 'healthRestart')}
      </button>}
      {scan.state === 'running' && <button type="button" className={button} onClick={() => controller.pause()}><Pause size={14} />{t('healthPause')}</button>}
      {scan.state === 'paused' && <button type="button" className={button} disabled={scan.offline} onClick={() => controller.resume()}><Play size={14} />{t('healthResume')}</button>}
      {active && <button type="button" className={button} disabled={busy} onClick={() => controller.stop()}><Square size={14} />{t('healthStop')}</button>}
    </div>
    <div className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-white/10">
      <div role="status" className="text-sm font-medium">{t(`health_${scan.state}`)}</div>
      <progress aria-label={t('healthTitle')} max={Math.max(1, scan.total)} value={scan.completed} className="h-2 w-full accent-sky-600" />
      <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{t('healthStats', scan)}</p>
      {scan.offline && <p className="text-xs text-amber-700 dark:text-amber-200">{t('healthOffline')}</p>}
    </div>
    {error && <p role="alert" className="break-words text-sm text-rose-600 dark:text-rose-300">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <input type="search" aria-label={t('healthSearch')} placeholder={t('healthSearch')} value={query} onChange={event => { setQuery(event.target.value); setPage(1); resetSelection(); }} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-white/20" />
      <span className="relative ml-auto max-w-full shrink-0"><select aria-label={t('healthFilter')} value={category} onChange={event => { setCategory(event.target.value as typeof category); setPage(1); resetSelection(); }} className={selectStyle}>
        {(['all', 'missing', 'restricted', 'temporary', 'unchecked'] as const).map(value => <option key={value} value={value}>{t(`health_${value}`)}</option>)}
      </select><ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-3 text-slate-500 dark:text-slate-300" /></span>
    </div>
    {results.total > 0 && <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="flex min-h-9 items-center gap-2"><input type="checkbox" aria-label={t('healthSelectPage')} checked={results.items.length > 0 && visibleSelection.length === results.items.length} onChange={event => setSelected(new Set(event.target.checked ? results.items.map(row => row.bookmark.id) : []))} />{t('healthSelectPage')}</label>
      <span className="text-slate-500">{t('healthSelection', { count: visibleSelection.length })}</span>
      <button type="button" className={button} disabled={busy || active || !visibleSelection.length} onClick={() => { void prepare(true); }}>{t('healthRecheck')}</button>
      <button type="button" className={button} disabled={busy || active || !visibleSelection.length} onClick={() => { controller.ignore(visibleSelection); resetSelection(); }}>{t('healthIgnore')}</button>
      <button type="button" className={`${button} text-rose-600 dark:text-rose-300`} disabled={busy || active || !visibleSelection.length} onClick={() => { setError(''); setConfirmTrash(true); }}>{t('healthTrash')}</button>
    </div>}
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
      {!results.items.length ? <p className="px-4 py-12 text-center text-sm text-slate-500">{t(scan.anomalies ? 'healthNoMatch' : scan.state === 'completed' ? 'healthNoProblems' : 'healthEmpty')}</p>
        : <ul className="divide-y divide-slate-200 dark:divide-white/10">{results.items.map(row => <li data-health-row key={row.bookmark.id} className="flex min-w-0 items-start gap-3 p-3 sm:p-4">
          <input type="checkbox" className="mt-1 shrink-0" aria-label={t('healthSelect', { title: row.bookmark.title || row.bookmark.url })} checked={selected.has(row.bookmark.id)} onChange={event => setSelected(current => { const next = new Set(current); if (event.target.checked) next.add(row.bookmark.id); else next.delete(row.bookmark.id); return next; })} />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={row.bookmark.title}>{row.bookmark.title || row.bookmark.url}</p>
            {networkTarget(row.bookmark.url) ? <div className="mt-1 min-w-0"><a href={row.bookmark.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full min-w-0 items-center gap-1 align-top text-xs text-sky-600 dark:text-sky-300"><span className="min-w-0 truncate">{row.bookmark.url}</span><ExternalLink size={12} className="shrink-0" /></a></div> : <p className="truncate text-xs text-slate-500">{row.bookmark.url}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"><span data-health-category={row.category} className={`rounded border px-2 py-1 font-medium ${categoryStyle[row.category]}`}>{t(`health_${row.category as Exclude<HealthCategory, 'success'>}`)}</span>
              <span>{row.reason === 'http' ? t('health_reason_http', { status: row.status ?? 0 }) : t(`health_reason_${row.reason}`)}</span>
              <span className="text-slate-500">{folderNames.get(row.bookmark.folderId ?? '') ?? t('healthFolderRoot')}</span>
              <span className="text-slate-500">{t('healthChecked', { time: new Date(row.checkedAt).toLocaleTimeString(language === 'en' ? 'en-US' : 'zh-CN') })}</span>
            </div>
          </div>
        </li>)}</ul>}
      <Pagination total={results.total} page={results.page} pageSize={pageSize} language={language} disabled={busy}
        onPageChange={value => { setPage(value); resetSelection(); }} onPageSizeChange={value => { setPageSize(value); setPage(1); resetSelection(); }} />
    </div>
    <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{t('healthLimit')}</p>
    <Modal isOpen={permissionPlan !== null} onClose={() => { if (!busy) setPermissionPlan(null); }} title={t('healthPermissionTitle')} contained maxWidth="lg" closeLabel={t('healthCancel')}>
      {permissionPlan && <div className="space-y-4 text-sm">
        <p>{t('healthPermissionSummary', { count: permissionPlan.entries.length })}</p>
        <p className="leading-relaxed text-slate-600 dark:text-slate-300">{t('healthPermissionNotice')}</p>
        <p className="rounded-lg bg-sky-500/10 p-3 text-xs leading-relaxed text-sky-800 dark:text-sky-200">{t('healthPermissionPersistent')}</p>
        {error && <p role="alert" className="text-rose-600">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={() => setPermissionPlan(null)}>{t('healthCancel')}</button><button type="button" className={`${button} bg-sky-600 !text-white`} disabled={busy} onClick={authorize}>{t('healthAuthorize')}</button></div>
      </div>}
    </Modal>
    <Modal isOpen={confirmTrash} onClose={() => { if (!busy) setConfirmTrash(false); }} title={t('healthTrashTitle')} contained closeLabel={t('healthCancel')}>
      <p className="text-sm leading-relaxed">{t('healthTrashNotice', { count: visibleSelection.length })}</p>
      {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={() => setConfirmTrash(false)}>{t('healthCancel')}</button><button type="button" className={`${button} text-rose-600`} disabled={busy} onClick={() => { void trash(); }}>{t('healthTrashConfirm')}</button></div>
    </Modal>
  </section>;
}
