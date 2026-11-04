import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Modal } from './Modal';
import { createTranslator } from '../../i18n';

export function LibraryChangeNotice({ visible, language, onReload }: {
  visible: boolean;
  language?: string;
  onReload(): void;
}) {
  const [confirming, setConfirming] = useState(false);
  const t = createTranslator(language);
  if (!visible) return null;
  return <>
    <div role="status" aria-label={t('libraryNoticeLabel')}
      className="mx-3 my-2 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/60 bg-amber-50/95 px-3 py-2 text-xs text-amber-950 sm:mx-8 dark:border-amber-400/30 dark:bg-amber-950/80 dark:text-amber-100">
      <p className="min-w-0 flex-1 basis-48 leading-5">{t('libraryNoticeMessage')}</p>
      <button type="button" onClick={() => setConfirming(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-700/30 px-2.5 py-2 font-medium hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-amber-700 dark:border-amber-200/30 dark:hover:bg-amber-900">
        <RefreshCw size={14} aria-hidden="true" />{t('libraryNoticeReload')}
      </button>
    </div>
    <Modal isOpen={confirming} onClose={() => setConfirming(false)} contained maxWidth="sm"
      title={t('libraryNoticeTitle')}>
      <p className="text-sm leading-6">{t('libraryNoticeWarning')}</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setConfirming(false)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-white/20">{t('libraryNoticeCancel')}</button>
        <button type="button" onClick={onReload}
          className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-700">
          <RefreshCw size={14} aria-hidden="true" />{t('libraryNoticeConfirm')}
        </button>
      </div>
    </Modal>
  </>;
}
