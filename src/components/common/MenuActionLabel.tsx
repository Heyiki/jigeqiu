import React from 'react';

export function MenuActionLabel({ label, detail }: { label: string; detail?: string }) {
  return <span className="block min-w-0 flex-1 text-left">
    <span className="block break-words">{label}</span>
    {detail && <span title={detail} className="mt-0.5 block truncate text-[11px] font-normal leading-4 text-slate-500 dark:text-slate-400">{detail}</span>}
  </span>;
}
