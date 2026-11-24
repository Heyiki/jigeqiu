import React, { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { UserSettings } from '../../types';
import { createTranslator } from '../../i18n';
import { LaunchpadMark } from './LaunchpadMark';

const normalizeSize = (size?: number) => Number.isFinite(size) ? Math.max(34, Math.min(74, Math.round(size!))) : 48;

export function DockSizeSettings({ settings, onUpdate }: {
  settings: UserSettings;
  onUpdate(updates: Partial<UserSettings>): boolean | void | Promise<boolean | void>;
}) {
  const t = createTranslator(settings.language);
  const saved = normalizeSize(settings.dockIconSize);
  const [draft, setDraft] = useState(saved);
  const latest = useRef(saved);
  const persisted = useRef(saved);
  const editing = useRef(false);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    persisted.current = saved;
    if (!editing.current && !pending.current) {
      latest.current = saved;
      setDraft(saved);
    }
  }, [saved]);
  const preview = (value: number) => {
    latest.current = normalizeSize(value);
    setDraft(latest.current);
    setError(false);
  };
  const commit = async () => {
    editing.current = false;
    if (pending.current || latest.current === persisted.current) return;
    const value = latest.current;
    pending.current = true;
    setSaving(true);
    try {
      if (await onUpdate({ dockIconSize: value }) === false) throw new Error('DOCK_SAVE');
      persisted.current = value;
      setError(false);
    } catch {
      preview(persisted.current);
      setError(true);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  const innerSize = Math.max(22, Math.round(draft * 0.72));
  return <div className="space-y-3 rounded-2xl border border-slate-200/50 bg-black/5 p-3.5 dark:border-white/10 dark:bg-white/5">
    <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-800 dark:text-slate-200">
      <label htmlFor="dock-icon-size">{t('managerTaskbarIconSize')}</label>
      <output htmlFor="dock-icon-size" className="shrink-0 font-mono text-sky-600 dark:text-sky-400">{draft} px</output>
    </div>
    <p id="dock-size-description" className="text-[11px] text-slate-500 dark:text-slate-400">{t('managerTaskbarSizeDescription')}</p>
    <input id="dock-icon-size" type="range" min={34} max={74} step={1} value={draft} disabled={saving}
      aria-describedby="dock-size-description" aria-valuetext={`${draft} px`}
      onChange={event => preview(Number(event.target.value))}
      onPointerDown={() => { editing.current = true; }}
      onPointerUp={() => { void commit(); }} onPointerCancel={() => { void commit(); }}
      onKeyDown={() => { editing.current = true; }}
      onKeyUp={() => { void commit(); }} onBlur={() => { void commit(); }}
      className="h-5 w-full cursor-pointer accent-sky-500 disabled:opacity-50" />
    <div className="flex justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
      <span>{t('managerCompactSize')}</span><span>{t('managerStandardSize')}</span><span>{t('managerLargeSize')}</span>
    </div>
    <div data-dock-preview="" role="img" aria-label={t('managerTaskbarPreview')}
      className="launchpad-preview flex min-h-36 items-center justify-center rounded-xl px-2 py-6">
      <div aria-hidden="true" className="relative flex items-center gap-1 rounded-2xl px-2 py-1.5 liquid-glass-dock sm:gap-2 sm:rounded-3xl sm:px-3.5 sm:py-2">
        <span className="absolute -top-1.5 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-slate-400/40 dark:bg-white/20" />
        <span data-dock-preview-icon="" className="flex shrink-0 items-center justify-center" style={{ width: draft, height: draft }}>
          <LaunchpadMark size={Math.round(innerSize * 0.82)} />
        </span>
        <span className="hidden shrink-0 items-center justify-center sm:flex" style={{ width: draft, height: draft }}>
          <span className="flex items-center justify-center rounded-xl bg-emerald-600 font-bold text-white" style={{ width: innerSize, height: innerSize, fontSize: innerSize * 0.5 }}>A</span>
        </span>
        <span className="mx-1 h-8 border-l border-slate-400/50 dark:border-white/20" />
        <span className="flex shrink-0 items-center justify-center" style={{ width: draft, height: draft }}>
          <span className="flex items-center justify-center rounded-xl bg-sky-500 text-white" style={{ width: innerSize, height: innerSize }}>
            <Plus size={Math.max(15, Math.round(draft * 0.38))} />
          </span>
        </span>
      </div>
    </div>
    <button type="button" disabled={saving || draft === 48}
      onClick={() => { preview(48); void commit(); }}
      className="text-xs font-medium text-sky-700 hover:underline disabled:cursor-default disabled:opacity-50 disabled:no-underline dark:text-sky-400">{t('managerTaskbarSizeReset')}</button>
    {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{t('managerTaskbarSaveFailed')}</p>}
  </div>;
}
