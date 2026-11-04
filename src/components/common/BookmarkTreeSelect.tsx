import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, ChevronRight, Folder, FolderOpen, Search, X } from 'lucide-react';
import type { Bookmark, Folder as LibraryFolder } from '../../types';
import { bookmarkTreeRows, type BookmarkTreeRow } from './bookmark-tree';
import { FaviconImage } from './FaviconImage';

type SelectionProps =
  | { multiple: true; value: string[]; onChange: (value: string[]) => void }
  | { multiple?: false; value?: string; onChange: (value: string | undefined) => void };

export type BookmarkTreeSelectProps = SelectionProps & {
  bookmarks: Bookmark[];
  folders: LibraryFolder[];
  label?: string;
  placeholder?: string;
  language?: string;
  disabled?: boolean;
};

export function BookmarkTreeSelect(props: BookmarkTreeSelectProps) {
  const { bookmarks, folders, language, disabled = false } = props;
  const en = language?.toLowerCase().startsWith('en');
  const text = (zh: string, english: string) => en ? english : zh;
  const label = props.label ?? text('选择收藏网址', 'Select bookmarks');
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const tree = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(new Set(folders.map(folder => folder.id)));
  const [active, setActive] = useState('');
  const rows = useMemo(() => bookmarkTreeRows(folders, bookmarks, search, expanded), [folders, bookmarks, search, expanded]);
  const selectedIds = props.multiple ? props.value : props.value ? [props.value] : [];
  const selected = new Set(selectedIds);
  const current = rows.find(row => row.key === active) ?? rows[0];
  const rowId = (row: BookmarkTreeRow) => `${id}-row-${encodeURIComponent(row.key)}`;
  const selectedBookmark = !props.multiple ? bookmarks.find(bookmark => bookmark.id === props.value) : undefined;
  const summary = props.multiple && selected.size
    ? text(`已选择 ${selected.size} 个网址`, `${selected.size} bookmarks selected`)
    : selectedBookmark?.title ?? props.placeholder ?? text('请选择收藏网址', 'Choose bookmarks');

  function close(restoreFocus = false) {
    setOpen(false);
    setSearch('');
    if (restoreFocus) trigger.current?.focus();
  }

  function show() {
    if (disabled) return;
    setSearch('');
    setExpanded(new Set(folders.map(folder => folder.id)));
    setActive(selectedIds[0] ? `bookmark:${selectedIds[0]}` : '');
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) close();
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  useEffect(() => {
    if (open && current) {
      const row = tree.current?.querySelector(`[id="${CSS.escape(rowId(current))}"]`);
      row?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, current?.key]);

  function toggleFolder(row: BookmarkTreeRow) {
    if (row.kind !== 'folder') return;
    if (search.trim()) {
      // Keep other search-revealed ancestors open when leaving filtered mode.
      setExpanded(new Set(rows.filter(item => item.kind === 'folder' && item.expanded && item.key !== row.key)
        .map(item => item.kind === 'folder' ? item.folder.id : '')));
      setSearch('');
    } else setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(row.folder.id)) next.delete(row.folder.id);
      else next.add(row.folder.id);
      return next;
    });
    setActive(row.key);
  }

  function choose(row: BookmarkTreeRow) {
    if (disabled) return;
    setActive(row.key);
    if (row.kind === 'folder') { toggleFolder(row); return; }
    if (props.multiple) {
      props.onChange(selected.has(row.bookmark.id)
        ? selectedIds.filter(value => value !== row.bookmark.id) : [...new Set([...selectedIds, row.bookmark.id])]);
    } else {
      props.onChange(row.bookmark.id);
      close(true);
    }
  }

  function navigate(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
      if (event.key === 'Enter') event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (event.key === 'Enter' || (event.key === ' ' && event.target !== input.current)) {
      event.preventDefault();
      event.stopPropagation();
      if (current) choose(current);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    if (event.target === input.current && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const index = current ? rows.indexOf(current) : 0;
    if (event.key === 'ArrowDown') setActive(rows[Math.min(rows.length - 1, index + 1)]?.key ?? '');
    if (event.key === 'ArrowUp') setActive(rows[Math.max(0, index - 1)]?.key ?? '');
    if (event.key === 'Home') setActive(rows[0]?.key ?? '');
    if (event.key === 'End') setActive(rows.at(-1)?.key ?? '');
    if (event.key === 'ArrowLeft' && current) {
      if (current.kind === 'folder' && current.expanded) toggleFolder(current);
      else setActive(current.parentKey ?? current.key);
    }
    if (event.key === 'ArrowRight' && current?.kind === 'folder') {
      if (!current.expanded) toggleFolder(current);
      else if (rows[index + 1]?.parentKey === current.key) setActive(rows[index + 1].key);
    }
  }

  const toolClass = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:bg-white/10';
  return <div ref={container} className="min-w-0 text-slate-900 dark:text-slate-100" onBlur={event => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) close();
  }}>
    <span id={`${id}-label`} className="mb-1.5 block text-xs font-medium">{label}</span>
    <button ref={trigger} type="button" disabled={disabled}
      aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open}
      aria-haspopup="tree" aria-controls={open ? `${id}-tree` : undefined}
      onClick={() => open ? close() : show()}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); }
      }}
      className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:border-white/20 dark:bg-white/5">
      <FolderOpen size={17} aria-hidden className="shrink-0 text-sky-600 dark:text-sky-400" />
      <span id={`${id}-value`} className="min-w-0 flex-1 truncate">{summary}</span>
      <ChevronDown size={16} aria-hidden className={`shrink-0 ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div className="mt-2 flex max-h-[min(60dvh,28rem)] min-w-0 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white text-slate-900 shadow-lg dark:border-white/20 dark:bg-zinc-900 dark:text-slate-100"
      onKeyDown={navigate}>
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-white/10">
        <Search size={15} aria-hidden className="shrink-0 text-slate-500" />
        <input ref={input} type="search" role="combobox" aria-expanded="true" aria-haspopup="tree"
          aria-controls={`${id}-tree`} aria-activedescendant={current ? rowId(current) : undefined}
          aria-label={text('搜索收藏网址', 'Search bookmarks')} placeholder={text('搜索名称、网址或目录', 'Search title, URL or folder')}
          value={search} onChange={event => { setSearch(event.target.value); setActive(''); }}
          className="w-full min-w-0 bg-transparent py-1 text-sm outline-none" />
        {search && <button type="button" className={toolClass} aria-label={text('清除筛选', 'Clear filter')}
          onClick={() => { setSearch(''); input.current?.focus(); }}><X size={15} aria-hidden /></button>}
      </div>
      <div ref={tree} id={`${id}-tree`} role="tree" aria-label={label} aria-multiselectable={props.multiple || undefined}
        className="min-h-0 overflow-y-auto overscroll-contain p-1">
        {rows.map(row => {
          const folder = row.kind === 'folder';
          const checked = !folder && selected.has(row.bookmark.id);
          const name = folder ? row.folder.name : row.bookmark.title;
          return <div key={row.key} id={rowId(row)} role="treeitem" aria-level={row.depth + 1}
            aria-label={name} aria-expanded={folder ? row.expanded : undefined}
            aria-selected={folder ? undefined : checked} tabIndex={current?.key === row.key ? 0 : -1}
            onFocus={() => setActive(row.key)} onClick={() => choose(row)}
            style={{ paddingLeft: `${Math.min(row.depth, 8) * 14 + 8}px` }}
            className={`flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-500 ${current?.key === row.key ? 'ring-1 ring-inset ring-sky-500/60' : ''} ${checked ? 'bg-sky-500/10 text-sky-800 dark:text-sky-200' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}>
            {folder ? <>
              <ChevronRight size={15} aria-hidden className={`shrink-0 ${row.expanded ? 'rotate-90' : ''}`} />
              {row.expanded ? <FolderOpen size={16} aria-hidden className="shrink-0" /> : <Folder size={16} aria-hidden className="shrink-0" />}
            </> : <>
              {props.multiple && <input type="checkbox" checked={checked} tabIndex={-1}
                aria-label={text(`选择收藏 ${row.bookmark.id}`, `Select bookmark ${row.bookmark.id}`)}
                onClick={event => event.stopPropagation()} onChange={() => choose(row)}
                className="h-4 w-4 shrink-0 accent-sky-600" />}
              <span className="shrink-0"><FaviconImage url={row.bookmark.url} title={row.bookmark.title}
                icon={row.bookmark.icon} iconMode={row.bookmark.iconMode} size="sm" /></span>
            </>}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{name}</span>
              {!folder && <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{row.bookmark.url}</span>}
            </span>
            {!props.multiple && checked && <Check size={15} aria-hidden className="shrink-0" />}
          </div>;
        })}
        {!rows.length && <p role="status" className="px-3 py-4 text-xs text-slate-500 dark:text-slate-400">
          {search.trim() ? text('没有匹配的收藏', 'No matching bookmarks') : text('暂无收藏网址', 'No bookmarks yet')}
        </p>}
      </div>
    </div>}
  </div>;
}
