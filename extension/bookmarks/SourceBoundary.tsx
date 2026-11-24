import { useEffect, useState, type ReactNode } from 'react';
import { getBookmarkSourcePlatform } from '../../src/services/bookmark-source-platform';
import { createTranslator } from '../../src/i18n';
import { Modal } from '../../src/components/common/Modal';

/** Keep existing drafts mounted behind a blocking notice when another page changes source. */
export function SourceBoundary({ language, children }: { language: string; children: ReactNode }) {
  const platform = getBookmarkSourcePlatform()!;
  const [problem, setProblem] = useState(platform.problem);
  const [started, setStarted] = useState(() => !platform.problem());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const t = createTranslator(language);
  useEffect(() => platform.subscribe(() => {
    const next = platform.problem();
    setProblem(next);
    if (!next) setStarted(true);
  }), [platform]);
  const change = async (source: 'extension' | 'browser') => {
    setBusy(true);
    setFailed(false);
    try { await platform.switchSource(source); location.reload(); }
    catch { setFailed(true); setBusy(false); }
  };
  return <>
    <div inert={!!problem || undefined}>{started && children}</div>
    {problem && <Modal isOpen contained maxWidth="lg" showCloseButton={false} onClose={() => {}}
      title={t('bookmarkSourceProblemTitle')}>
      <div aria-busy={busy} className="text-slate-800 dark:text-slate-100">
        <p role="alert" className="text-sm leading-7">{t(problem === 'changed' ? 'bookmarkSourceChanged'
          : problem === 'permission' ? 'bookmarkSourcePermissionLost' : problem === 'uncertain' ? 'bookmarkSourceUncertain' : 'bookmarkSourceUnavailable')}</p>
        {failed && <p role="alert" className="mt-3 text-sm text-rose-600">{t('bookmarkSourcePermissionError')}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-3">
          {(problem === 'permission' || problem === 'unavailable') && <button type="button" disabled={busy}
            className="rounded-lg border px-3 py-2 text-sm" onClick={() => void change('extension')}>{t('bookmarkSourceExtension')}</button>}
          {problem === 'permission' && <button type="button" disabled={busy}
            className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white" onClick={() => void change('browser')}>{t('bookmarkSourceGrant')}</button>}
          <button type="button" disabled={busy} className="rounded-lg border px-3 py-2 text-sm" onClick={() => location.reload()}>{t('bookmarkSourceReload')}</button>
        </div>
      </div>
    </Modal>}
  </>;
}
