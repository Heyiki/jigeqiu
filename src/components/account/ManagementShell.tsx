import React from 'react';
import { Library, Search, Sliders, Upload, Trash2 } from 'lucide-react';
import { createTranslator } from '../../i18n';
import { BackToTop } from '../common/BackToTop';

export type ManagementSection = 'bookmarks' | 'engines' | 'appearance' | 'import-export' | 'trash';
const groups = [
  { label: 'managementGroupContent', items: [
    { id: 'bookmarks', label: 'managementSectionBookmarks', icon: Library },
  ] },
  { label: 'managementGroupPreferences', items: [
    { id: 'engines', label: 'managementSectionEngines', icon: Search },
    { id: 'appearance', label: 'managementSectionAppearance', icon: Sliders },
  ] },
  { label: 'managementGroupData', items: [
    { id: 'import-export', label: 'managementSectionImportExport', icon: Upload },
    { id: 'trash', label: 'managementSectionTrash', icon: Trash2 },
  ] },
] as const;

export function ManagementShell({ section, onNavigate, onSectionIntent, language, children, showDock, dockIconSize }: {
  section: ManagementSection; onNavigate: (section: ManagementSection) => void;
  onSectionIntent?: (section: ManagementSection) => void;
  language?: string; children: React.ReactNode;
  showDock?: boolean; dockIconSize?: number;
}) {
  const t = createTranslator(language);
  const selected = groups.flatMap(group => [...group.items]).find(item => item.id === section)!;
  return <div className="min-h-[calc(100dvh-60px)] w-full bg-white/90 dark:bg-[#11151e]/95">
    <div className="mx-auto w-full max-w-[1440px] px-3 py-5 sm:px-8 sm:py-6">
    <div className="mb-5 flex min-w-0 items-center gap-3">
      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{t('managementTitle')}</span>
      <span aria-hidden className="h-4 border-l border-slate-300 dark:border-white/20" />
      <h1 className="min-w-0 truncate text-lg font-semibold text-slate-950 dark:text-white">{t(selected.label)}</h1>
    </div>
    <div className="mb-4 md:hidden">
      <select aria-label={t('managementSectionLabel')} value={section}
        onChange={event => onNavigate(event.target.value as ManagementSection)}
        className="h-10 w-full rounded-lg border border-slate-300 bg-white/70 px-3 text-sm text-slate-800 dark:border-white/15 dark:bg-white/10 dark:text-slate-100">
        {groups.map(group => <optgroup key={group.label} label={t(group.label)}>
          {group.items.map(item => <option key={item.id} value={item.id}>{t(item.label)}</option>)}
        </optgroup>)}
      </select>
    </div>
    <div className="flex min-w-0 items-start gap-5 lg:gap-7">
      <nav aria-label={t('managementNavigationLabel')} className="hidden w-40 shrink-0 space-y-5 border-r border-slate-300/60 pr-4 dark:border-white/10 md:block">
        {groups.map(group => <div key={group.label}>
          <h2 className="mb-2 px-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">{t(group.label)}</h2>
          <div className="space-y-1">{group.items.map(item => <button key={item.id} type="button"
            aria-current={section === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}
            onPointerEnter={() => onSectionIntent?.(item.id)} onFocus={() => onSectionIntent?.(item.id)}
            onTouchStart={() => onSectionIntent?.(item.id)}
            className={`flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${section === item.id ? 'bg-sky-500/15 font-semibold text-sky-800 dark:text-sky-200' : 'text-slate-700 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/5'}`}>
            <item.icon size={15} className="shrink-0" /><span>{t(item.label)}</span>
          </button>)}</div>
        </div>)}
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
    </div>
    <BackToTop language={language} showDock={showDock} dockIconSize={dockIconSize} />
  </div>;
}

/** A quiet content placeholder; real navigation and titles remain available. */
export function ManagementContentPlaceholder() {
  return <div aria-busy="true" className="min-h-80 space-y-5 motion-safe:animate-pulse">
    <div aria-hidden="true" className="flex items-center justify-between gap-4">
      <div className="h-9 w-64 max-w-[65%] rounded-lg bg-slate-200/70 dark:bg-white/10" />
      <div className="h-9 w-24 rounded-lg bg-slate-200/70 dark:bg-white/10" />
    </div>
    <div aria-hidden="true" className="overflow-hidden rounded-xl border border-slate-200/70 dark:border-white/10">
      {[0, 1, 2, 3, 4].map(row => <div key={row} className="flex h-16 items-center gap-4 border-b border-slate-200/50 px-4 last:border-0 dark:border-white/5">
        <div className="h-8 w-8 shrink-0 rounded-lg bg-slate-200/70 dark:bg-white/10" />
        <div className="h-3 w-2/5 rounded bg-slate-200/70 dark:bg-white/10" />
      </div>)}
    </div>
  </div>;
}
