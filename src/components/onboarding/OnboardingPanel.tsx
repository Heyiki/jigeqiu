import { useEffect } from 'react';
import { Download, Plus, Upload, Pin, X } from 'lucide-react';
import { createTranslator } from '../../i18n';
import { DesktopDialog, desktopDialogButton } from '../desktop/DesktopDialog';
import { OnboardingTour } from './Tour';
import type { OnboardingEntry } from './types';
import type { useOnboarding } from './useOnboarding';

export function OnboardingPanel({ controller: c, language, hasBookmarks, onStart, onBackup, hideResult = false }: {
  controller: ReturnType<typeof useOnboarding>; language?: string; hasBookmarks: boolean;
  onStart(entry: OnboardingEntry): void; onBackup(): void;
  hideResult?: boolean;
}) {
  const t = createTranslator(language);
  const { phase, task } = c.flow;
  useEffect(() => {
    if (phase === 'result' && c.showBackup) c.backupDisplayed();
  }, [phase, c.showBackup, c.backupDisplayed]);
  useEffect(() => {
    if (phase !== 'result' || hideResult) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      c.exit();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [phase, hideResult, c.exit]);
  const choices = <>
    {hasBookmarks && <button className={desktopDialogButton} onClick={() => onStart('pin')}><Pin size={15} />{t('onboardingPinTask')}</button>}
    <button className={desktopDialogButton} onClick={() => onStart('import')}><Upload size={15} />{t('onboardingImportTask')}</button>
    <button className={desktopDialogButton} onClick={() => onStart('add')}><Plus size={15} />{t('onboardingAddTask')}</button>
  </>;
  const backup = c.showBackup && <div className="mt-4 border-t border-black/10 pt-3 dark:border-white/10">
    <p className="mb-2 text-xs leading-5">{t('onboardingBackupDescription')}</p>
    <button type="button" className={desktopDialogButton} onClick={onBackup}><Download size={15} />{t('onboardingBackupTitle')}</button>
  </div>;
  return <>
    {(c.saveFailed || c.unavailable) && <div role="status" className="fixed left-3 right-3 top-16 z-[1500] mx-auto flex max-w-xl items-center gap-3 rounded-md border border-amber-500/40 bg-white p-3 text-xs text-zinc-900 shadow dark:bg-zinc-900 dark:text-zinc-100">
      <p className="flex-1">{t(c.unavailable ? 'onboardingTourUnavailable' : 'onboardingProgressSaveFailed')}</p>
      <button aria-label={t('onboardingExit')} onClick={c.dismissNotice}><X size={16} /></button>
    </div>}
    {phase === 'tour' && <OnboardingTour language={language} onComplete={c.tourComplete} onExit={c.exit} onUnavailable={c.fail} />}
    {(phase === 'welcome' || phase === 'taskPicker') && <DesktopDialog compact
      title={t(phase === 'welcome' ? 'onboardingWelcomeTitle' : 'onboardingChooseTask')}
      label={t(phase === 'welcome' ? 'onboardingWelcomeTitle' : 'onboardingChooseTask')}
      language={language} busy={false} error="" onClose={c.exit}>
      {phase === 'welcome' ? <>
        <p className="mb-4 text-sm leading-6">{t('onboardingWelcomeBody')}</p>
        <div className="flex flex-wrap gap-2">
          <button className={desktopDialogButton} onClick={() => onStart('tour')}>{t('onboardingStart')}</button>
          <button className={desktopDialogButton} onClick={c.exit}>{t('onboardingSkip')}</button>
        </div>
      </> : <>
        {!hasBookmarks && <p className="mb-3 text-sm leading-6">{t('onboardingNoBookmarks')}</p>}
        <div className="flex flex-wrap gap-2">{choices}<button className={desktopDialogButton} onClick={c.exit}>{t('onboardingLater')}</button></div>
      </>}
    </DesktopDialog>}
    {phase === 'result' && !hideResult && <section data-onboarding="result" role="status"
      className="fixed bottom-24 left-3 right-3 z-[1450] mx-auto max-h-[50dvh] max-w-md overflow-auto rounded-lg border border-sky-500/30 bg-white p-4 text-zinc-900 shadow-lg dark:bg-zinc-900 dark:text-zinc-100">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm leading-6">{t(task === 'import' ? 'onboardingImportDone' : task === 'add' ? 'onboardingAddDone' : 'onboardingPinDone')}</p>
        <button aria-label={t('onboardingExit')} onClick={c.exit}><X size={16} /></button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {task !== 'pin' && hasBookmarks && <button className={desktopDialogButton} onClick={() => onStart('pin')}>{t('onboardingPinTask')}</button>}
        <button className={desktopDialogButton} onClick={c.exit}>{t('onboardingDone')}</button>
      </div>{backup}
    </section>}
  </>;
}
