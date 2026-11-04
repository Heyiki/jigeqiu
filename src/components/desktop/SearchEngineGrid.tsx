import React, { useRef } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { SearchEngine } from '../../types';
import { FaviconImage } from '../common/FaviconImage';

export function SearchEngineGrid({ engines, selectedId, onSelect, onManage, onClose }: {
  engines: SearchEngine[];
  selectedId: string;
  onSelect: (engine: SearchEngine) => void;
  onManage?: () => void;
  onClose: () => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const navigate = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(grid.current?.querySelectorAll<HTMLButtonElement>('[data-engine-choice]') ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const firstY = buttons[0].getBoundingClientRect().top;
    const columns = buttons.filter(button => Math.abs(button.getBoundingClientRect().top - firstY) < 2).length;
    let next = index;
    if (event.key === 'ArrowRight') next++;
    if (event.key === 'ArrowLeft') next--;
    if (event.key === 'ArrowDown') next += columns;
    if (event.key === 'ArrowUp') next -= columns;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = buttons.length - 1;
    buttons[Math.min(buttons.length - 1, Math.max(0, next))]?.focus();
  };
  return <section role="group" aria-label="搜索引擎" id="spotlight-engines"
    className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
    <div className="mb-3 flex items-center justify-between px-1">
      <h2 className="text-xs font-semibold text-slate-600 dark:text-slate-300">搜索引擎</h2>
      <button type="button" onClick={onClose} title="收起搜索引擎" aria-label="收起搜索引擎"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-slate-300 dark:hover:bg-white/10">
        <X size={16} />
      </button>
    </div>
    <div ref={grid} onKeyDown={navigate} className="grid grid-cols-3 items-start gap-x-2 gap-y-3 sm:grid-cols-6 sm:gap-x-3">
      {engines.map(engine => <button key={engine.id} data-engine-choice type="button"
        aria-label={engine.name} aria-pressed={engine.id === selectedId} title={`${engine.name} · /${engine.keyword}`}
        onClick={() => onSelect(engine)}
        className={`group flex min-w-0 flex-col items-center gap-2 rounded-lg px-1 pb-1 pt-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 ${engine.id === selectedId
          ? 'bg-sky-50 text-sky-800 dark:bg-sky-400/10 dark:text-sky-100'
          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5'}`}>
        <span className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border transition-colors ${engine.id === selectedId
          ? 'border-sky-400/70 bg-white shadow-sm dark:border-sky-400/60 dark:bg-white/10'
          : 'border-slate-200 bg-slate-50 group-hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:group-hover:bg-white/10'}`}>
          <span data-engine-icon className="flex h-11 w-11 items-center justify-center">
            <FaviconImage url={engine.urlTemplate} title={engine.name} icon={engine.icon} size="md" className="!h-11 !w-11" />
          </span>
          {engine.id === selectedId && <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-sky-600 text-white ring-2 ring-white dark:ring-zinc-900"><Check size={10} strokeWidth={3} /></span>}
        </span>
        <span className="flex w-full min-w-0 flex-col items-center gap-0.5">
          <span data-engine-name className="line-clamp-2 w-full shrink-0 break-words text-center text-xs font-medium leading-[18px]">{engine.name}</span>
          <span className="block h-4 w-full shrink-0 truncate text-center font-mono text-[11px] font-normal leading-4 text-slate-500 dark:text-slate-400" title={`/${engine.keyword}`}>/{engine.keyword}</span>
        </span>
      </button>)}
      {onManage && <button type="button" data-engine-choice aria-label="添加或管理搜索引擎" title="添加或管理搜索引擎"
        onClick={onManage}
        className="group flex min-w-0 flex-col items-center gap-2 rounded-lg px-1 pb-1 pt-2 text-slate-500 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-300 dark:hover:bg-white/5">
        <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 group-hover:bg-white dark:border-white/20 dark:bg-white/5">
          <Plus size={25} strokeWidth={1.5} />
        </span>
        <span className="flex w-full flex-col items-center gap-0.5">
          <span className="text-xs font-medium leading-[18px]">添加</span>
          <span aria-hidden="true" className="h-4" />
        </span>
      </button>}
    </div>
  </section>;
}
