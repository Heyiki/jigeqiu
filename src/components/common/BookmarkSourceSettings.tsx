import React, { useState } from 'react';
import { createTranslator } from '../../i18n';
import { getBookmarkSourcePlatform, type BookmarkSource } from '../../services/bookmark-source-platform';
import { preferenceSaveError } from '../../services/preference-save-error';
import { Modal } from './Modal';

export function BookmarkSourceSettings({ language }: { language?: string }) {
  const platform = getBookmarkSourcePlatform();
  const [target, setTarget] = useState<BookmarkSource>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const t = createTranslator(language);
  if (!platform) return null;
  const current = platform.source();
  const change = async () => {
    if (busy || !target) return;
    setBusy(true);
    setError(undefined);
    try {
      await platform.switchSource(target);
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error && cause.message === 'BOOKMARK_PERMISSION_REQUIRED'
        ? t('bookmarkSourcePermissionError') : preferenceSaveError(cause, language));
      setBusy(false);
    }
  };
  return <section className="mb-5 rounded-2xl border border-slate-300/80 bg-white/50 p-4 text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-slate-100" aria-label={t('bookmarkSourceTitle')}>
    <div className="flex flex-wrap items-center gap-3">
      <h3 className="text-sm font-semibold">{t('bookmarkSourceTitle')}</h3>
      {(['extension', 'browser'] as const).map(source => <button key={source} type="button"
        disabled={busy} aria-pressed={current === source}
        onClick={() => { if (source !== current) { setError(undefined); setTarget(source); } }}
        className={`rounded-lg border px-3 py-2 text-sm disabled:opacity-50 ${current === source ? 'border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'border-slate-300 dark:border-white/20'}`}>
        {t(source === 'browser' ? 'bookmarkSourceBrowser' : 'bookmarkSourceExtension')}
      </button>)}
    </div>
    <p className="mt-3 text-xs leading-6 text-slate-600 dark:text-slate-300">{t('bookmarkSourceDescription')}</p>
    {current === 'browser' && <p className="mt-1 text-xs leading-6 text-sky-800 dark:text-sky-200">{t('bookmarkSourceBrowserDescription')}</p>}
    {target && <Modal isOpen onClose={() => { if (!busy) setTarget(undefined); }} showCloseButton={!busy} maxWidth="lg" contained
      closeLabel={t('bookmarkSourceCancel')} title={t(target === 'browser' ? 'bookmarkSourceConfirmBrowser' : 'bookmarkSourceConfirmExtension')}>
      <div className="p-5 text-slate-800 dark:text-slate-100" aria-busy={busy}>
        <p className="mt-3 text-sm leading-7">{t(target === 'browser' ? 'bookmarkSourcePermissionDisclosure' : 'bookmarkSourceExtensionDisclosure')}</p>
        {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" disabled={busy} onClick={() => setTarget(undefined)} className="rounded-lg border px-4 py-2 text-sm">{t('bookmarkSourceCancel')}</button>
          <button type="button" disabled={busy} onClick={() => void change()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white disabled:opacity-50">{t(busy ? 'bookmarkSourceBusy' : 'bookmarkSourceConfirm')}</button>
        </div>
      </div>
    </Modal>}
  </section>;
}

export function BookmarkSourceNotice({ language }: { language?: string }) {
  const platform = getBookmarkSourcePlatform();
  const t = createTranslator(language);
  if (!platform) return null;
  return <p data-bookmark-source={platform.source()} className="mb-3 rounded-lg bg-sky-500/10 px-3 py-2 text-xs leading-5 text-sky-800 dark:text-sky-200">
    {t('bookmarkSourceSaveTo', { source: t(platform.source() === 'browser' ? 'bookmarkSourceBrowser' : 'bookmarkSourceExtension') })}
  </p>;
}
