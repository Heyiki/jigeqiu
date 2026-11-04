import type { ReactNode } from 'react';
import { Info, X } from 'lucide-react';
import { createTranslator } from '../../i18n';

type HintMessage = 'onboardingAddUrl' | 'onboardingAddDetails' | 'onboardingImportFile'
  | 'onboardingImportPreview' | 'onboardingPinSearch' | 'onboardingPinChoose' | 'onboardingPinAction' | 'onboardingPinDone';

export function TaskHint({ language, message, onDismiss, children }: {
  language?: string; message: HintMessage; onDismiss(): void; children?: ReactNode;
}) {
  const t = createTranslator(language);
  return <aside data-onboarding="task-hint" className="my-2 flex shrink-0 items-start gap-2 rounded-md border border-amber-400 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-500/70 dark:bg-[#382a12] dark:text-amber-100">
    <Info size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
    <div className="min-w-0 flex-1 break-words"><p>{t(message)}</p>{children}</div>
    <button type="button" onClick={onDismiss} aria-label={t('onboardingExit')} title={t('onboardingExit')}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-amber-200/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 dark:hover:bg-amber-400/15 dark:focus-visible:outline-amber-300"><X size={15} /></button>
  </aside>;
}
