import { useEffect, useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { DesktopDialog } from './DesktopDialog';
import { SHORTCUTS } from './app-shortcuts';
import { actionTerm } from '../common/action-terms';
import { SYSTEM_COMMANDS } from './spotlight-commands';
import { createTranslator, resolveLocale } from '../../i18n';
import type { OnboardingEntry } from '../onboarding/types';

export function DesktopGuide({ language, open, onOpenChange, onStartOnboarding }: {
  language?: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  onStartOnboarding?(entry: OnboardingEntry): void;
}) {
  const [section, setSection] = useState(0);
  const [bottom, setBottom] = useState(14);
  const button = useRef<HTMLButtonElement>(null);
  const locale = resolveLocale(language);
  const en = locale === 'en';
  const t = createTranslator(locale);
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  useEffect(() => {
    const dock = document.querySelector('[data-testid="bottom-dock"]');
    const measure = () => {
      const rect = dock?.getBoundingClientRect();
      const trigger = button.current?.getBoundingClientRect();
      setBottom(rect && trigger && rect.width && rect.right > trigger.left - 12
        ? Math.max(14, innerHeight - rect.top + 12) : 14);
    };
    const observer = new ResizeObserver(measure);
    if (dock) observer.observe(dock);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const sections = [t('guideGettingStarted'), t('guideKeyboard'), t('guideCommands'), t('guideActions')];
  const rows = [
    [actionTerm('add', locale), t('guideActionAdd')],
    [actionTerm('pinDesktop', locale), t('guideActionPinDesktop')],
    [actionTerm('removeDesktop', locale), t('guideActionRemoveDesktop')],
    [actionTerm('unpinDock', locale), t('guideActionUnpinDock')],
    [actionTerm('moveDesktop', locale), t('guideActionMoveDesktop')],
    [actionTerm('reveal', locale), t('guideActionReveal')],
    [actionTerm('dissolveDesktop', locale), t('guideActionDissolveDesktop')],
    [actionTerm('removeFolder', locale), t('guideActionRemoveFolder')],
    [actionTerm('deleteBookmark', locale), t('guideActionDeleteBookmark')],
  ];
  const keys = (values: readonly string[]) => <span className="inline-flex flex-wrap justify-end gap-1">
    {values.map((value, index) => <kbd key={index} className="rounded border border-slate-300/70 bg-black/5 px-1.5 py-0.5 text-[11px] dark:border-white/20 dark:bg-white/10">{value}</kbd>)}
  </span>;
  return <>
    <button ref={button} data-onboarding="guide" type="button" aria-label={t('guideTitle')} title={t('guideTitle')}
      style={{ bottom, right: 'max(14px, env(safe-area-inset-right))' }}
      className="fixed z-30 flex h-9 w-9 items-center justify-center rounded-full border border-white/50 bg-white/70 text-slate-700 shadow-sm backdrop-blur-md hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/20 dark:bg-black/30 dark:text-slate-200 dark:hover:border-white/40 dark:hover:bg-zinc-800/90 dark:hover:text-white dark:focus-visible:outline-sky-300"
      onClick={() => onOpenChange(true)}><CircleHelp size={19} /></button>
    {open && <DesktopDialog label={t('guideTitle')} title={t('guideTitle')}
      language={locale} busy={false} error="" onClose={() => onOpenChange(false)}>
      <div role="tablist" aria-label={t('guideSections')} className="mb-4 flex border-b border-black/10 dark:border-white/10">
        {sections.map((label, index) => <button key={index} role="tab" id={`guide-tab-${index}`}
          aria-selected={section === index} aria-controls="guide-panel" tabIndex={section === index ? 0 : -1}
          onClick={() => setSection(index)} onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1
              : (index + (event.key === 'ArrowRight' ? 1 : sections.length - 1)) % sections.length;
            setSection(next);
            document.getElementById(`guide-tab-${next}`)?.focus();
          }}
          className={`min-h-10 min-w-0 flex-1 break-words border-b-2 px-0 py-2 text-[11px] sm:px-2 sm:text-xs ${section === index ? 'border-sky-500 font-semibold text-sky-700 dark:text-sky-300' : 'border-transparent text-slate-500 dark:text-slate-400'}`}>{label}</button>)}
      </div>
      <div id="guide-panel" role="tabpanel" aria-labelledby={`guide-tab-${section}`} className="min-h-64 text-sm leading-6">
        {section === 0 && <>
          {onStartOnboarding && <div className="mb-4 flex flex-wrap gap-2">
            {(['tour', 'import', 'add', 'pin'] as const).map((entry, index) => <button key={entry}
              type="button" className="rounded-md border border-sky-500/30 px-3 py-2 text-xs text-sky-800 dark:text-sky-200"
              onClick={() => { onOpenChange(false); onStartOnboarding(entry); }}>
              {t((['onboardingGuideStart', 'onboardingGuideImport', 'onboardingGuideAdd', 'onboardingGuidePin'] as const)[index])}
            </button>)}
          </div>}
          <ol className="list-decimal space-y-3 pl-5">
          <li>{t('guideStartImport')}</li>
          <li>{t('guideStartOrganize')}</li>
          <li>{t('guideStartPin')}</li>
          <li>{t('guideStartSearch')}</li>
          <li>{t('guideStartBackup')}</li>
        </ol></>}
        {section === 1 && <>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{t('guideKeyboardScope')}</p>
          <dl className="divide-y divide-black/10 dark:divide-white/10">
            {SHORTCUTS.map(shortcut => <div key={shortcut.action} className="flex items-center justify-between gap-3 py-2"><dt>{en ? shortcut.en : shortcut.zh}</dt><dd>{keys([mod, ...shortcut.keys])}</dd></div>)}
            {[
              [t('guideSearchEntry'), ['/', '、']],
              [t('guideDesktopPages'), ['←', '→']],
              [t('guideSearchSelection'), ['↑', '↓']],
              [t('guideLaunchpadSelection'), ['←', '↑', '↓', '→']],
              [t('guideControlNavigation'), ['Tab', 'Shift + Tab']],
              [t('guideSubmit'), ['Enter']],
              [t('guideClose'), ['Esc']],
            ].map(([label, values]) => <div key={label as string} className="flex items-center justify-between gap-3 py-2"><dt>{label}</dt><dd>{keys(values as string[])}</dd></div>)}
          </dl>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t('guideKeyboardDetails')}</p>
        </>}
        {section === 2 && <>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{t('guideCommandsIntro')}</p>
          <dl className="divide-y divide-black/10 dark:divide-white/10">
            {SYSTEM_COMMANDS.map(command => <div key={command.id}
              className="grid grid-cols-[5rem_minmax(0,1fr)] items-baseline gap-x-3 py-2">
              <dt><code className="text-xs font-semibold">/{command.id}</code></dt>
              <dd className="min-w-0 break-words text-xs leading-5 text-slate-500 dark:text-slate-400">
                {t(command.id === 'setting' ? 'guideSettingAlias' : command.description)}
              </dd>
            </div>)}
          </dl>
          <ul className="mt-3 list-disc space-y-2 break-words pl-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
            <li>{t('guideCommandMatching')}</li>
            <li>{t('guideCommandModes')}</li>
            <li>{t('guideCommandEngines', { syntax: t('guideEngineSyntax') })}</li>
          </ul>
        </>}
        {section === 3 && <dl className="divide-y divide-black/10 dark:divide-white/10">{rows.map(([label, description]) =>
          <div key={label} className="py-2.5"><dt className="font-medium">{label}</dt><dd className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</dd></div>)}</dl>}
      </div>
    </DesktopDialog>}
  </>;
}
