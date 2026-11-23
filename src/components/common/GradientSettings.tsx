import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { GradientBackground, UserSettings } from '../../types';
import { createTranslator } from '../../i18n';
import { gradientImage, GRADIENT_PRESETS, normalizeGradient } from '../../services/gradient-background';
import { notifyWallpaperChange } from '../../services/custom-wallpaper';

export function GradientSettings({ settings, onUpdate }: {
  settings: UserSettings;
  onUpdate(updates: Partial<UserSettings>, signal?: AbortSignal): boolean | void | Promise<boolean | void>;
}) {
  const t = createTranslator(settings.language);
  const [draft, setDraft] = useState(() => normalizeGradient(settings.gradientBackground));
  const latest = useRef(draft);
  const pending = useRef(0);
  const tail = useRef(Promise.resolve());
  const controller = useRef<AbortController | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const lifetime = new AbortController();
    controller.current = lifetime;
    return () => lifetime.abort();
  }, []);
  useEffect(() => {
    if (pending.current) return;
    latest.current = normalizeGradient(settings.gradientBackground);
    setDraft(latest.current);
  }, [settings.gradientBackground]);

  const update = (changes: Partial<GradientBackground>) => {
    const value = normalizeGradient({ ...latest.current, ...changes });
    latest.current = value;
    setDraft(value);
    setError(false);
    pending.current++;
    // Serialize color-picker events so the final color always wins.
    tail.current = tail.current.then(async () => {
      const signal = controller.current?.signal;
      if (!signal || signal.aborted) return;
      try {
        if (await onUpdate({ backgroundType: 'gradient', gradientBackground: value }, signal) === false) throw new Error('GRADIENT_SAVE');
        if (!signal.aborted) notifyWallpaperChange();
      } catch {
        if (!signal.aborted) setError(true);
      }
    }).finally(() => { pending.current--; });
  };

  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3">
      {GRADIENT_PRESETS.map(preset => {
        const selected = draft.start === preset.start && draft.end === preset.end && draft.angle === preset.angle;
        return <button key={preset.id} type="button" aria-label={t('gradientSelect', { name: t(preset.label) })}
          aria-pressed={selected} onClick={() => update(preset)}
          className={`relative min-w-0 rounded-lg border p-2 text-left ${selected ? 'border-sky-500 ring-2 ring-sky-500/20' : 'border-slate-200/60 dark:border-white/15'}`}>
          <div className="mb-2 aspect-[3/2] w-full rounded" style={{ backgroundImage: gradientImage(preset) }} />
          <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200">{t(preset.label)}</span>
          {selected && <Check aria-hidden size={18} className="absolute right-3 top-3 rounded bg-sky-600 text-white" />}
        </button>;
      })}
    </div>
    <details className="rounded-lg border border-slate-200/60 p-3 dark:border-white/15">
      <summary className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">{t('gradientCustom')}</summary>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {(['start', 'end'] as const).map(key => <label key={key} className="min-w-0 text-xs text-slate-600 dark:text-slate-300">
          <span className="mb-2 block">{t(key === 'start' ? 'gradientStart' : 'gradientEnd')}</span>
          <input type="color" value={draft[key]} aria-label={t(key === 'start' ? 'gradientStart' : 'gradientEnd')}
            onChange={event => update({ [key]: event.target.value })}
            className="h-10 w-full cursor-pointer rounded border border-slate-200 bg-transparent p-1 dark:border-white/15" />
          <span className="mt-1 block font-mono text-[11px]">{draft[key].toUpperCase()}</span>
        </label>)}
        <label className="col-span-2 text-xs text-slate-600 dark:text-slate-300">
          <span className="mb-2 block">{t('gradientDirection')}</span>
          <select value={draft.angle} aria-label={t('gradientDirection')} onChange={event => update({ angle: Number(event.target.value) })}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs dark:border-white/15 dark:bg-slate-900">
            {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => <option key={angle} value={angle}>{angle}°</option>)}
            {![0, 45, 90, 135, 180, 225, 270, 315].includes(draft.angle) && <option value={draft.angle}>{draft.angle}°</option>}
          </select>
        </label>
      </div>
    </details>
    {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{t('gradientSaveFailed')}</p>}
  </div>;
}
