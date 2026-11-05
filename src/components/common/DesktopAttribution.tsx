import React from 'react';

export function DesktopAttribution() {
  return (
    <a href="https://jiawulin.github.io/" target="_blank" rel="noopener noreferrer"
      className="fixed bottom-3.5 left-4 z-30 hidden md:flex max-w-[calc(100vw-2rem)] items-center gap-2 px-3 py-1 rounded-full liquid-glass bg-white/95 dark:bg-[var(--glass-bg)] border border-slate-300/80 dark:border-white/10 text-[10px] text-slate-700 dark:text-slate-300 font-medium shadow-xs select-none backdrop-blur-md outline-none hover:underline focus-visible:ring-2 focus-visible:ring-sky-500">
      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
      <span>Powered by 记个球 · jiawulin.github.io</span>
    </a>
  );
}
