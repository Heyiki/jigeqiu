import React, { useEffect, useRef, useState } from 'react';
import type { UserSettings } from '../../types';
import { createTranslator } from '../../i18n';
import { DEFAULT_LAUNCHPAD_BLUR, MAX_LAUNCHPAD_BLUR, normalizeLaunchpadBlur } from '../../services/launchpad-background';
import { LaunchpadMark } from './LaunchpadMark';

export function LaunchpadSettings({ settings, onUpdate }: {
  settings: UserSettings;
  onUpdate(updates: Partial<UserSettings>): boolean | void | Promise<boolean | void>;
}) {
  const t = createTranslator(settings.language);
  const saved = normalizeLaunchpadBlur(settings.launchpadBackgroundBlur);
  const [draft, setDraft] = useState(saved);
  const latest = useRef(draft);
  const editing = useRef(false);
  const pending = useRef(false);
  const persisted = useRef(saved);
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
    latest.current = normalizeLaunchpadBlur(value);
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
      if (await onUpdate({ launchpadBackgroundBlur: value }) === false) throw new Error('LAUNCHPAD_SAVE');
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

  return <section className="space-y-3 border-t border-slate-200/50 pt-4 dark:border-white/10">
    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">{t('launchpadSettingsTitle')}</h4>
    <div className="space-y-3 rounded-2xl border border-slate-200/50 bg-black/5 p-3.5 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-800 dark:text-slate-200">
        <label htmlFor="launchpad-background-blur">{t('launchpadBackgroundBlur')}</label>
        <output htmlFor="launchpad-background-blur" className="shrink-0 font-mono text-sky-600 dark:text-sky-400">{draft} px</output>
      </div>
      <p id="launchpad-blur-description" className="text-[11px] text-slate-500 dark:text-slate-400">{t('launchpadBlurDescription')}</p>
      <input id="launchpad-background-blur" type="range" min={0} max={MAX_LAUNCHPAD_BLUR} step={1}
        value={draft} disabled={saving} aria-describedby="launchpad-blur-description"
        aria-valuetext={draft === 0 ? t('launchpadBlurOff') : `${draft} px`}
        onChange={event => preview(Number(event.target.value))}
        onPointerDown={() => { editing.current = true; }}
        onPointerUp={() => { void commit(); }} onPointerCancel={() => { void commit(); }}
        onKeyDown={() => { editing.current = true; }}
        onKeyUp={() => { void commit(); }} onBlur={() => { void commit(); }}
        className="h-5 w-full cursor-pointer accent-sky-500 disabled:opacity-50" />
      <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
        <span>{t('launchpadBlurOff')}</span><span>{t('launchpadBlurStrong')}</span>
      </div>
      <div data-launchpad-preview="" aria-label={t('launchpadBlurPreview')}
        className="launchpad-preview rounded-xl px-4 py-5"
        style={{ '--launchpad-background-blur': `${draft}px` } as React.CSSProperties}>
        <div className="mb-5 flex items-center gap-2 text-xs font-semibold"><LaunchpadMark size={22} />{t('launchpadSettingsTitle')}</div>
        <div aria-hidden="true" className="flex justify-center gap-8">
          {['A', 'B', 'C'].map((letter, index) => <div key={letter} className="flex flex-col items-center gap-2">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold text-white shadow-sm ${['bg-sky-600', 'bg-emerald-600', 'bg-violet-600'][index]}`}>{letter}</span>
            <span className="h-1 w-8 rounded-full bg-current opacity-80" />
          </div>)}
        </div>
      </div>
      <button type="button" disabled={saving || draft === DEFAULT_LAUNCHPAD_BLUR}
        onClick={() => { preview(DEFAULT_LAUNCHPAD_BLUR); void commit(); }}
        className="text-xs font-medium text-sky-700 hover:underline disabled:cursor-default disabled:opacity-50 disabled:no-underline dark:text-sky-400">{t('launchpadBlurReset')}</button>
      {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{t('launchpadBlurSaveFailed')}</p>}
    </div>
  </section>;
}
