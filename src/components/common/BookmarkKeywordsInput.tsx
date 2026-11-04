import React, { useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { parseBookmarkKeywords } from '../../services/bookmark-input';
import { createTranslator } from '../../i18n';

export function BookmarkKeywordsInput({ value, onChange, language }: {
  value: string[]; onChange: (value: string[]) => void; language?: string;
}) {
  const id = useId();
  const t = createTranslator(language);
  const [draft, setDraft] = useState('');
  const composing = useRef(false);
  const commit = (input = draft) => {
    onChange(parseBookmarkKeywords([...value, input].join(',')));
    setDraft('');
  };
  return <div>
    <label htmlFor={id} className="mb-1.5 block text-xs font-semibold">
      {t('keywordLabel')}
    </label>
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-black/[0.025] px-2.5 py-2 focus-within:border-sky-500 dark:border-white/15 dark:bg-white/5">
      {value.map(keyword => <span key={keyword} className="inline-flex max-w-full items-center gap-1 rounded bg-sky-100 px-2 py-1 text-xs text-sky-900 dark:bg-sky-400/15 dark:text-sky-100">
        <span className="break-all">{keyword}</span>
        <button type="button" title={t('removeKeyword', { keyword })}
          aria-label={t('removeKeyword', { keyword })}
          onClick={() => onChange(value.filter(item => item !== keyword))}
          className="shrink-0 rounded hover:bg-sky-200 focus-visible:outline-sky-500 dark:hover:bg-white/10"><X size={12} /></button>
      </span>)}
      <input id={id} value={draft}
        placeholder={t('keywordPlaceholder')}
        className="min-w-0 flex-1 basis-52 bg-transparent text-xs leading-6 outline-none placeholder:text-slate-400"
        onBlur={() => { if (draft.trim()) commit(); }}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={event => {
          composing.current = false;
          const input = event.currentTarget.value;
          if (/[,，\n]/.test(input)) commit(input);
        }}
        onChange={event => {
          const input = event.target.value;
          if (!composing.current && /[,，\n]/.test(input)) commit(input);
          else setDraft(input);
        }}
        onKeyDown={event => {
          if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) {
            if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); }
            return;
          }
          if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
            event.preventDefault(); event.stopPropagation(); commit();
          }
          if (event.key === 'Backspace' && !draft && value.length) {
            event.preventDefault(); onChange(value.slice(0, -1));
          }
        }} />
    </div>
  </div>;
}
