import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { createTranslator } from '../../i18n';

interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  language?: string;
  disabled?: boolean;
  summary?: string;
  onPageChange(page: number): void;
  onPageSizeChange(size: number): void;
}

export function Pagination({
  total, page, pageSize, language, disabled = false, summary, onPageChange, onPageSizeChange,
}: PaginationProps) {
  const t = createTranslator(language);
  if (total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(totalPages, Math.max(1, page));
  const pages = [...new Set([1, current - 1, current, current + 1, totalPages])]
    .filter(value => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  const button = 'shrink-0 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-sky-500';

  return <div className="flex min-w-0 flex-col sm:flex-row items-center justify-between gap-3 px-3 sm:px-5 py-3 border-t border-slate-200/60 dark:border-white/5 bg-black/[0.01] dark:bg-white/[0.01] text-xs">
    <div className="flex flex-wrap items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
      <span>{summary ?? <>{t('managerFilteredCountLead')}<strong className="text-slate-800 dark:text-slate-200">{total}</strong>{t('managerFilteredCountTail')}</>}</span>
      <span aria-hidden="true" className="text-slate-300 dark:text-white/10">|</span>
      <label className="flex items-center gap-1.5">
        <span>{t('managerPageSize')}</span>
        <select value={pageSize} disabled={disabled} onChange={event => onPageSizeChange(Number(event.target.value))}
          className="px-2 py-1 rounded-lg bg-black/5 dark:bg-white/10 border border-slate-200/60 dark:border-white/10 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-sky-500 cursor-pointer">
          {[15, 30, 50, 100].map(size => <option key={size} value={size}>{t('managerPageSizeOption', { count: size })}</option>)}
        </select>
      </label>
    </div>
    <div role="group" className="flex max-w-full flex-wrap items-center justify-center gap-1">
      <button type="button" disabled={disabled || current === 1} onClick={() => onPageChange(1)}
        className={`${button} p-1.5`} title={t('managerFirstPage')} aria-label={t('managerFirstPage')}><ChevronsLeft size={14} /></button>
      <button type="button" disabled={disabled || current === 1} onClick={() => onPageChange(current - 1)}
        className={`${button} p-1.5 sm:px-2.5 sm:py-1 font-medium`} title={t('managerPreviousPage')} aria-label={t('managerPreviousPage')}>
        <ChevronLeft size={14} className="sm:hidden" /><span className="hidden sm:inline">{t('managerPreviousPage')}</span>
      </button>
      <div className="flex items-center gap-1 px-1">
        {pages.map((value, index) => <span key={value} className="inline-flex items-center gap-1">
          {index > 0 && value - pages[index - 1] > 1 && <span className="px-1 text-slate-400">...</span>}
          <button type="button" disabled={disabled} onClick={() => onPageChange(value)}
            aria-label={t('managerPageNumber', { page: value })} aria-current={value === current ? 'page' : undefined}
            className={`${button} h-7 w-7 font-semibold ${value === current ? 'bg-sky-500 !text-white shadow-2xs' : ''}`}>{value}</button>
        </span>)}
      </div>
      <button type="button" disabled={disabled || current === totalPages} onClick={() => onPageChange(current + 1)}
        className={`${button} p-1.5 sm:px-2.5 sm:py-1 font-medium`} title={t('managerNextPage')} aria-label={t('managerNextPage')}>
        <ChevronRight size={14} className="sm:hidden" /><span className="hidden sm:inline">{t('managerNextPage')}</span>
      </button>
      <button type="button" disabled={disabled || current === totalPages} onClick={() => onPageChange(totalPages)}
        className={`${button} p-1.5`} title={t('managerLastPage')} aria-label={t('managerLastPage')}><ChevronsRight size={14} /></button>
    </div>
  </div>;
}
