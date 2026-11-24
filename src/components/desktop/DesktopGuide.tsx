import { useContext, useEffect, useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { DesktopDialog } from './DesktopDialog';
import { SHORTCUTS } from './app-shortcuts';
import { actionTerm } from '../common/action-terms';
import { SYSTEM_COMMANDS } from './spotlight-commands';
import { createTranslator, resolveLocale } from '../../i18n';
import type { OnboardingEntry } from '../onboarding/types';
import { PrivacyNoticeContext } from '../common/PrivacyNoticeContext';

export function DesktopGuide({ language, open, onOpenChange, onStartOnboarding }: {
  language?: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  onStartOnboarding?(entry: OnboardingEntry): void;
}) {
  const [section, setSection] = useState(0);
  const privacyNotice = useContext(PrivacyNoticeContext);
  const [bottom, setBottom] = useState(14);
  const button = useRef<HTMLButtonElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const locale = resolveLocale(language);
  const en = locale === 'en';
  const t = createTranslator(locale);
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  useEffect(() => {
    if (!open || !privacyNotice) return;
    const revealTab = () => tabs.current?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    revealTab();
    window.addEventListener('resize', revealTab);
    return () => window.removeEventListener('resize', revealTab);
  }, [open, section, privacyNotice]);
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
  const sections = [t('guideGettingStarted'), t('guideKeyboard'), t('guideCommands'), t('guideActions'),
    ...(privacyNotice ? [t('extensionPrivacy')] : [])];
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
  const keys = (values: readonly string[], separator = '+') => <span className="inline-flex items-center gap-1 whitespace-nowrap">
    {values.map((value, index) => <span key={index} className="inline-flex items-center gap-1">
      {index > 0 && <span className="text-xs">{separator}</span>}
      <kbd className="rounded border border-slate-300/70 bg-black/5 px-1.5 py-0.5 text-[11px] dark:border-white/20 dark:bg-white/10">{value}</kbd>
    </span>)}
  </span>;
  const alternatives = (options: readonly (readonly string[])[]) =>
    <span className="inline-flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1 text-xs">
      {options.map((option, index) => <span key={index} className="inline-flex items-center gap-1.5">
        {index > 0 && <span>{t('guideShortcutOr')}</span>}{keys(option)}
      </span>)}
    </span>;
  const shortcutRow = 'grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-3 py-2';
  return <>
    <button ref={button} data-onboarding="guide" type="button" aria-label={t('guideTitle')} title={t('guideTitle')}
      style={{ bottom, right: 'max(14px, env(safe-area-inset-right))' }}
      className="fixed z-30 flex h-9 w-9 items-center justify-center rounded-full border border-white/50 bg-white/70 text-slate-700 shadow-sm backdrop-blur-md hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-white/20 dark:bg-black/30 dark:text-slate-200 dark:hover:border-white/40 dark:hover:bg-zinc-800/90 dark:hover:text-white dark:focus-visible:outline-sky-300"
      onClick={() => onOpenChange(true)}><CircleHelp size={19} /></button>
    {open && <DesktopDialog label={t('guideTitle')} title={t('guideTitle')}
      language={locale} busy={false} error="" onClose={() => onOpenChange(false)}>
      <div ref={tabs} role="tablist" aria-label={t('guideSections')} className="mb-4 flex overflow-x-auto border-b border-black/10 dark:border-white/10">
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
          className={`min-h-10 min-w-0 border-b-2 py-2 text-[11px] sm:text-xs ${privacyNotice ? 'shrink-0 grow whitespace-nowrap px-2' : 'flex-1 break-words px-0 sm:px-2'} ${section === index ? 'border-sky-500 font-semibold text-sky-700 dark:text-sky-300' : 'border-transparent text-slate-500 dark:text-slate-400'}`}>{label}</button>)}
      </div>
      <div id="guide-panel" role="tabpanel" aria-labelledby={`guide-tab-${section}`} tabIndex={section === 4 ? 0 : undefined} className="min-h-64 text-sm leading-6">
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
            {SHORTCUTS.map(shortcut => <div key={shortcut.action} className={shortcutRow}>
              <dt className="min-w-0 break-words">{en ? shortcut.en : shortcut.zh}</dt>
              <dd className="min-w-0 text-right">{shortcut.action === 'search'
                ? <span className="inline-flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1 text-xs">
                  {keys([mod, ...shortcut.keys])}<span>{t('guideShortcutOr')}</span>
                  {keys(['Shift', 'Shift'], '→')}<span>{t('guideDoubleShiftHint')}</span>
                </span>
                : keys([mod, ...shortcut.keys])}</dd>
            </div>)}
            {[
              { label: t('guideSearchEntry'), options: [['/'], ['、']] },
              { label: t('guideDesktopPages'), options: [['←'], ['→']] },
              { label: t('guideSearchSelection'), options: [['↑'], ['↓']] },
              { label: t('guideLaunchpadSelection'), options: [['←'], ['↑'], ['↓'], ['→']] },
              { label: t('guideControlNavigation'), options: [['Tab'], ['Shift', 'Tab']] },
              { label: t('guideSubmit'), options: [['Enter']] },
              { label: t('guideClose'), options: [['Esc']] },
            ].map(({ label, options }) => <div key={label} className={shortcutRow}>
              <dt className="min-w-0 break-words">{label}</dt>
              <dd className="min-w-0 text-right">{alternatives(options)}</dd>
            </div>)}
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
        {section === 4 && <div className="space-y-5 break-words select-text [&_h3]:mb-2 [&_h3]:font-semibold">{privacyNotice}</div>}
      </div>
    </DesktopDialog>}
  </>;
}
