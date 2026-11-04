import { actionTerm } from '../common/action-terms';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowUp, Check, Copy, Edit, ExternalLink, EyeOff, FolderInput, FolderOpen, Library, MoreHorizontal, Pin, PinOff, Plus, RefreshCw, Settings2, Trash2 } from 'lucide-react';
import type { DesktopFolder, Layout } from '../../domain/assets/model';
import type { Bookmark, Folder } from '../../types';
import { DesktopDialog, desktopDialogButton, desktopDialogInput, useDesktopDialogAction } from './DesktopDialog';
import { DesktopConfirmPopover, type DesktopConfirmation } from './DesktopConfirmPopover';
import { FaviconImage } from '../common/FaviconImage';
import { DesktopIconLabel } from './DesktopIconLabel';
import { MenuActionLabel } from '../common/MenuActionLabel';
import { bookmarkLibraryPath } from '../common/folder-tree';
import { desktopDropIntent, desktopInsertionIndex, positionDesktopMenu } from './desktop-layout';
import { FOLDER_DRAG_CANCEL, FOLDER_DRAG_END, transferFolderDrag, type FolderDragEnd } from './desktop-drag-transfer';
import { refreshSiteIcon } from '../../services/site-icons';

export interface DesktopFolderModalProps {
  onboardingHint?: ReactNode;
  revealBookmarkId?: string;
  folder: DesktopFolder;
  layout: Layout;
  bookmarks: Bookmark[];
  folders: Folder[];
  language?: string;
  dockBookmarkIds?: string[];
  onClose(): void;
  onOpenBookmark(bookmark: Bookmark): void;
  onEditBookmark(bookmark: Bookmark): void;
  onToggleDock(bookmarkId: string): void;
  onRevealBookmark(bookmark: Bookmark): void;
  onRemoveShortcut(bookmarkId: string): void;
  onDeleteBookmark(bookmarkId: string): void;
  onShowToast?(message: string): void;
  onRename(name: string): void;
  onMove(bookmarkId: string, folderId: string | null): void;
  onPin(bookmarkId: string): void;
  onReorder(shortcutIds: string[]): void;
  onRemove(mode: 'dissolve' | 'remove-shortcuts'): void;
  onQuickAdd(): void;
}

export function DesktopFolderModal(props: DesktopFolderModalProps) {
  return <FolderContents key={props.folder.id} {...props} />;
}

function FolderContents({
  folder, layout, bookmarks, folders, language, dockBookmarkIds = [], onClose, onOpenBookmark, onEditBookmark,
  onToggleDock, onRevealBookmark, onRemoveShortcut, onDeleteBookmark, onShowToast, onRename,
  onMove, onPin, onReorder, onRemove, onQuickAdd, onboardingHint, revealBookmarkId,
}: DesktopFolderModalProps) {
  const text = (zh: string, en: string) => language === 'en' ? en : zh;
  const { busy, error, run } = useDesktopDialogAction(language);
  const [name, setName] = useState(folder.name);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [managing, setManaging] = useState(false);
  const [confirmation, setConfirmation] = useState<DesktopConfirmation | null>(null);
  const [menu, setMenu] = useState<{ bookmark: Bookmark; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLElement | null>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 12, top: 12, maxHeight: 400 });
  const [moving, setMoving] = useState<Bookmark | null>(null);
  const [destination, setDestination] = useState('');
  const gridRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!revealBookmarkId) return;
    const target = gridRef.current?.querySelector<HTMLElement>(`[data-folder-bookmark="${CSS.escape(revealBookmarkId)}"]`);
    target?.scrollIntoView({ block: 'nearest' });
    target?.focus({ preventScroll: true });
  }, [revealBookmarkId]);
  const blankDragImage = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [cancelingDrag, setCancelingDrag] = useState(false);
  const [dragError, setDragError] = useState('');
  const dragRef = useRef<string | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const slotRef = useRef<number | null>(null);
  const [suspended, setSuspended] = useState(false);
  const transferred = useRef(false);
  const bookmarkMap = new Map(bookmarks.map(bookmark => [bookmark.id, bookmark]));
  const shortcutMap = new Map(layout.shortcuts.map(shortcut => [shortcut.id, shortcut]));
  const entries = folder.shortcutIds.map(shortcutId => ({
    shortcutId, bookmark: bookmarkMap.get(shortcutMap.get(shortcutId)?.bookmarkId ?? ''),
  }));
  const memberIds = new Set(entries.flatMap(entry => entry.bookmark ? [entry.bookmark.id] : []));
  const candidates = bookmarks.filter(bookmark => !memberIds.has(bookmark.id));
  const query = filter.trim().toLocaleLowerCase();
  const visibleCandidates = candidates.filter(bookmark =>
    !query || `${bookmark.title} ${bookmark.url} ${(bookmark.keywords ?? []).join(' ')}`.toLocaleLowerCase().includes(query));
  const otherFolders = layout.folders.filter(item => item.id !== folder.id);
  const callbacks = useRef({ onClose });
  callbacks.current = { onClose };
  const clearDrag = () => {
    dragRef.current = null;
    setDrag(null);
    slotRef.current = null;
    setSlot(null);
    setSuspended(false);
    transferred.current = false;
    setCancelingDrag(false);
  };
  useEffect(() => {
    const end = (event: Event) => {
      if (!transferred.current) return;
      const detail = (event as CustomEvent<FolderDragEnd>).detail;
      clearDrag();
      if (detail.error) setDragError(detail.error);
      if (detail.committed) callbacks.current.onClose();
    };
    const cancel = () => {
      if (!dragRef.current) return;
      if (transferred.current) window.dispatchEvent(new Event(FOLDER_DRAG_CANCEL));
      clearDrag();
    };
    window.addEventListener(FOLDER_DRAG_END, end);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener(FOLDER_DRAG_END, end);
      window.removeEventListener('blur', cancel);
    };
  }, []);
  useEffect(() => {
    if (!drag) return;
    const follow = (event: DragEvent) => {
      if (transferred.current) return;
      setDrag(current => current ? { ...current, x: event.clientX, y: event.clientY } : null);
      const panel = gridRef.current?.closest('[role="dialog"]')?.getBoundingClientRect();
      if (panel && (event.clientX < panel.left - 12 || event.clientX > panel.right + 12
        || event.clientY < panel.top - 12 || event.clientY > panel.bottom + 12)) {
        transferred.current = true;
        setSuspended(true);
        setSlot(null);
        transferFolderDrag({ bookmarkId: dragRef.current!, folderId: folder.id, x: event.clientX, y: event.clientY });
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || transferred.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      dragRef.current = null;
      setSlot(null);
      slotRef.current = null;
      setCancelingDrag(true);
    };
    document.addEventListener('dragover', follow, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('dragover', follow, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [!!drag, folder.id]);
  const closeMenu = () => {
    setMenu(null);
    menuTrigger.current?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    setMenuPosition(positionDesktopMenu({
      x: menu.x, y: menu.y, width: menuRef.current.offsetWidth, height: menuRef.current.scrollHeight,
      viewportWidth: innerWidth, viewportHeight: innerHeight,
    }));
    menuRef.current.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault(); event.stopImmediatePropagation(); closeMenu();
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        const actions = [...menuRef.current!.querySelectorAll<HTMLElement>('[role="menuitem"]')];
        const index = actions.indexOf(document.activeElement as HTMLElement);
        actions[event.key === 'Home' ? 0 : event.key === 'End' ? actions.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + actions.length) % actions.length]?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key, true);
    };
  }, [menu]);
  function showMenu(event: React.MouseEvent, bookmark: Bookmark) {
    event.preventDefault(); event.stopPropagation();
    menuTrigger.current = event.currentTarget as HTMLElement;
    setMenu({ bookmark, x: event.clientX, y: event.clientY });
  }
  function confirmAt(anchor: { x: number; y: number }, mode: 'dissolve' | 'remove-shortcuts') {
    setConfirmation({
      ...anchor, title: text('确认移除桌面文件夹', 'Confirm desktop folder removal'),
      message: mode === 'dissolve'
        ? text(`解散「${folder.name}」并将 ${folder.shortcutIds.length} 个快捷方式移回桌面？原收藏和归档目录保持不变。`, `Dissolve "${folder.name}" and move ${folder.shortcutIds.length} shortcuts to the desktop? Library bookmarks are kept.`)
        : text(`移除「${folder.name}」及其中 ${folder.shortcutIds.length} 个桌面快捷方式？原收藏和归档目录保持不变。`, `Remove "${folder.name}" and ${folder.shortcutIds.length} shortcuts? Library bookmarks are kept.`),
      label: mode === 'dissolve' ? text('确认解散', 'Confirm dissolve') : text('确认移除快捷方式', 'Confirm shortcut removal'),
      action: () => onRemove(mode),
    });
  }
  const action = (label: string, Icon: typeof Copy, perform: () => void | Promise<void>, detail?: string, danger = false) =>
    <button type="button" role="menuitem" aria-label={label} className={`flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs cursor-pointer hover:bg-sky-500/15 focus:bg-sky-500/15 focus:outline-none ${danger ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'}`}
      onClick={() => { closeMenu(); void run(perform); }}><Icon size={14} className="shrink-0" /><MenuActionLabel label={label} detail={detail} /></button>;
  const separator = <div role="separator" className="my-1 border-t border-black/10 dark:border-white/10" />;
  const draggedBookmark = drag ? bookmarkMap.get(drag.id) : null;
  const metrics = () => {
    const element = gridRef.current!;
    const columns = getComputedStyle(element).gridTemplateColumns.split(' ').length;
    return { columns, cellSize: element.clientWidth / columns };
  };
  const gridMetrics = slot !== null && gridRef.current ? metrics() : null;
  return <>
    <DesktopDialog label="桌面文件夹" title={folder.name} language={language} suspended={suspended}
      busy={busy} error={dragError || error} onClose={() => { if (!dragRef.current) void run(onClose); }}>
      <div ref={blankDragImage} aria-hidden="true" className="fixed left-0 top-0 h-px w-px pointer-events-none" />
      {onboardingHint}
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{text(`${entries.length} 个网站`, `${entries.length} websites`)}</span>
        <button type="button" className={desktopDialogButton} disabled={busy} onClick={() => { setManaging(value => !value); setMoving(null); }}>
          {managing ? <ArrowLeft size={14} /> : <Settings2 size={14} />}{managing ? text('返回文件夹', 'Back to folder') : text('管理文件夹', 'Manage folder')}
        </button>
      </div>
      {managing ? <>
        <form className="flex flex-wrap items-end gap-2 border-b border-black/10 pb-4 dark:border-white/10"
          onSubmit={event => { event.preventDefault(); if (name.trim()) void run(() => onRename(name.trim())); }}>
          <label className="min-w-0 flex-1 text-xs">{text('桌面文件夹名称', 'Desktop folder name')}
            <input aria-label={text('桌面文件夹名称', 'Desktop folder name')} required className={`${desktopDialogInput} mt-1 w-full`}
              value={name} disabled={busy} onChange={event => setName(event.target.value)} />
          </label>
          <button type="submit" className={desktopDialogButton} disabled={busy || !name.trim() || name.trim() === folder.name}><Check size={14} />{text('重命名', 'Rename')}</button>
        </form>
        <footer className="flex flex-wrap justify-between gap-2 pt-4">
          {(['dissolve', 'remove-shortcuts'] as const).map(mode => <button key={mode} type="button" className={desktopDialogButton} disabled={busy}
            onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); confirmAt({ x: rect.left, y: rect.bottom }, mode); }}>
            {mode === 'dissolve' ? <FolderOpen size={14} /> : <Trash2 size={14} />}
            {mode === 'dissolve' ? actionTerm('dissolveDesktop', language) : actionTerm('removeFolder', language)}
          </button>)}
        </footer>
      </> : <>
        {moving && <form className="mb-3 flex flex-wrap items-end gap-2 border-b border-black/10 pb-3 dark:border-white/10"
          onSubmit={event => { event.preventDefault(); void run(async () => { await onMove(moving.id, destination); setMoving(null); }); }}>
          <label className="min-w-0 flex-1 text-xs">{text('目标桌面文件夹', 'Desktop folder')}
            <select aria-label="目标桌面文件夹" className={`${desktopDialogInput} mt-1 w-full`} value={destination} onChange={event => setDestination(event.target.value)}>
              {otherFolders.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <button type="button" className={desktopDialogButton} onClick={() => setMoving(null)}>{text('取消', 'Cancel')}</button>
          <button type="submit" className={desktopDialogButton} disabled={busy || !destination}>{text('移动', 'Move')}</button>
        </form>}
        <section ref={gridRef} aria-label={text('文件夹网站', 'Folder websites')} data-testid="folder-grid" data-folder-dragging={drag ? '' : undefined}
          className="relative grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] justify-items-center sm:grid-cols-[repeat(auto-fill,minmax(128px,1fr))]"
          onDragOver={event => {
            if (!dragRef.current || transferred.current) return;
            event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move';
            const { columns, cellSize } = metrics();
            const rect = event.currentTarget.getBoundingClientRect();
            const intent = desktopDropIntent({ x: event.clientX - rect.left, y: event.clientY - rect.top,
              columns, cellSize, count: entries.length });
            const source = entries.findIndex(entry => entry.bookmark?.id === dragRef.current);
            const next = desktopInsertionIndex(source, intent.slot, entries.length) === source ? null : intent.slot;
            slotRef.current = next; setSlot(next);
          }}
          onDrop={event => {
            event.preventDefault(); event.stopPropagation();
            const source = entries.findIndex(entry => entry.bookmark?.id === dragRef.current);
            if (source >= 0 && slotRef.current !== null) {
              const ids = [...folder.shortcutIds];
              const [id] = ids.splice(source, 1);
              ids.splice(desktopInsertionIndex(source, slotRef.current, entries.length), 0, id);
              void run(() => onReorder(ids));
            }
            clearDrag();
          }}>
          {entries.map(({ shortcutId, bookmark }, index) => bookmark ? <div key={shortcutId} className="group/item relative flex aspect-square w-full justify-center">
            <button type="button" data-folder-bookmark={bookmark.id} disabled={busy} draggable={!busy}
              data-onboarding-target={revealBookmarkId === bookmark.id || undefined}
              aria-label={text(`打开收藏：${bookmark.title}`, `Open bookmark: ${bookmark.title}`)}
              onClick={() => { if (!dragRef.current && !cancelingDrag) void run(() => onOpenBookmark(bookmark)); }}
              onContextMenu={event => showMenu(event, bookmark)}
              onKeyDown={event => {
                if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') {
                  event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect();
                  menuTrigger.current = event.currentTarget; setMenu({ bookmark, x: rect.left, y: rect.bottom });
                }
              }}
              onDragStart={event => {
                setMenu(null); setCancelingDrag(false); setDragError(''); dragRef.current = bookmark.id; transferred.current = false;
                event.dataTransfer.setData('text/plain', bookmark.id); event.dataTransfer.effectAllowed = 'move';
                if (blankDragImage.current) event.dataTransfer.setDragImage(blankDragImage.current, 0, 0);
                setDrag({ id: bookmark.id, x: event.clientX, y: event.clientY });
              }}
              onDragEnd={() => { if (!transferred.current) clearDrag(); }}
              style={{ transform: `translateX(${slot !== null && index === slot ? 24 : slot !== null && index === slot - 1 ? -24 : 0}px)` }}
              className={`desktop-item group flex h-24 w-full max-w-24 min-w-0 cursor-grab flex-col items-center rounded-lg px-1 pt-1 outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50 dark:hover:bg-white/5 ${drag?.id === bookmark.id ? 'opacity-20' : ''}`}>
              <div className="h-16 w-16 shrink-0"><FaviconImage title={bookmark.title} url={bookmark.url} icon={bookmark.icon}
                iconMode={bookmark.iconMode} iconBg={bookmark.iconBg} showTitle={false} size="lg" className="h-full w-full transition-transform group-hover:scale-105" /></div>
              <DesktopIconLabel name={bookmark.title} disabled={busy || !!menu || !!drag} />
            </button>
            <button type="button" title={text(`更多操作：${bookmark.title}`, `More actions: ${bookmark.title}`)}
              aria-label={text(`更多操作：${bookmark.title}`, `More actions: ${bookmark.title}`)}
              className="absolute right-0 top-0 rounded-md bg-white/80 p-1 text-slate-600 sm:opacity-0 sm:group-hover/item:opacity-100 focus:opacity-100 dark:bg-black/50 dark:text-slate-200"
              onClick={event => showMenu(event, bookmark)}><MoreHorizontal size={14} /></button>
          </div> : <p key={shortcutId} className="text-xs text-amber-700">{text('原收藏不可用', 'Bookmark unavailable')}</p>)}
          {slot !== null && gridMetrics && <div data-testid="folder-drop-slot" className="desktop-drop-slot" role="img" aria-label={text('插入到这里', 'Insert here')}
            style={{ left: Math.max(0, Math.min(gridRef.current!.clientWidth - 60,
              (slot === entries.length && slot % gridMetrics.columns === 0 ? gridMetrics.columns : slot % gridMetrics.columns) * gridMetrics.cellSize - 30)),
              top: Math.min(Math.ceil(entries.length / gridMetrics.columns) - 1, Math.floor(slot / gridMetrics.columns)) * gridMetrics.cellSize + 4 }}><Plus size={20} /></div>}
        </section>
        {entries.length === 0 && <div className="flex min-h-40 items-center justify-center text-slate-500"><FolderOpen size={32} /></div>}
        <details className="mt-3 border-t border-black/10 py-3 dark:border-white/10">
          <summary className="cursor-pointer text-xs font-semibold">{text('添加已有收藏', 'Add existing bookmarks')}</summary>
          <div className="mt-3 space-y-2">
            <input aria-label={text('搜索已有收藏', 'Search existing bookmarks')} className={`${desktopDialogInput} w-full`}
              disabled={busy} value={filter} onChange={event => setFilter(event.target.value)} />
            <div className="max-h-48 overflow-y-auto overscroll-contain">
              {visibleCandidates.map(bookmark => <label key={bookmark.id} className="flex cursor-pointer gap-2 py-2 text-xs">
                <input type="checkbox" disabled={busy} checked={selected.includes(bookmark.id)} onChange={event =>
                  setSelected(current => event.target.checked ? [...current, bookmark.id] : current.filter(id => id !== bookmark.id))} />
                <span className="min-w-0 break-words">{bookmark.title}</span>
              </label>)}
            </div>
            <button type="button" className={desktopDialogButton} disabled={busy || !selected.length} onClick={() => { void run(async () => {
              for (const id of selected.filter(id => candidates.some(item => item.id === id))) {
                if (layout.shortcuts.some(item => item.bookmarkId === id)) await onMove(id, folder.id); else await onPin(id);
                setSelected(current => current.filter(item => item !== id));
              }
            }); }}><Plus size={14} />{text('添加所选收藏', 'Add selected bookmarks')} ({selected.length})</button>
          </div>
        </details>
        <footer className="flex justify-end border-t border-black/10 pt-3 dark:border-white/10">
          <button type="button" className={desktopDialogButton} disabled={busy} onClick={() => { void run(onQuickAdd); }}><Plus size={14} />{text('添加新网址', 'Add new URL')}</button>
        </footer>
      </>}
      {menu && createPortal(<div ref={menuRef} role="menu" aria-label="文件夹图标菜单" data-desktop-popup style={menuPosition}
        onContextMenu={event => event.preventDefault()}
        className="fixed z-[1600] w-56 max-w-[calc(100vw-24px)] rounded-lg p-1 liquid-glass bg-white/95 dark:bg-[#181d28]/95 backdrop-blur-2xl border border-white/60 dark:border-white/15 shadow-xl overflow-y-auto">
        <div className="px-2.5 py-2 text-xs font-semibold truncate text-slate-500 dark:text-slate-400" title={menu.bookmark.title}>{menu.bookmark.title}</div>
        {action(text('在新标签页打开', 'Open in new tab'), ExternalLink, () => onOpenBookmark(menu.bookmark))}
        {action(text('编辑收藏', 'Edit bookmark'), Edit, () => onEditBookmark(menu.bookmark))}
        {action(text('复制网址', 'Copy URL'), Copy, async () => {
          try { await navigator.clipboard.writeText(menu.bookmark.url); onShowToast?.(text('已复制链接', 'Link copied')); }
          catch { onShowToast?.(text('复制失败，请在收藏管理中复制网址', 'Copy failed. Copy the URL in bookmark management.')); }
        }, menu.bookmark.url)}
        {separator}
        {action(dockBookmarkIds.includes(menu.bookmark.id) ? actionTerm('unpinDock', language) : actionTerm('pinDock', language),
          dockBookmarkIds.includes(menu.bookmark.id) ? PinOff : Pin, () => onToggleDock(menu.bookmark.id))}
        {action(text('移回桌面', 'Move to desktop'), ArrowUp, () => onMove(menu.bookmark.id, null))}
        {otherFolders.length > 0 && action(actionTerm('moveDesktop', language), FolderInput, () => { setMoving(menu.bookmark); setDestination(otherFolders[0].id); })}
        {separator}
        {menu.bookmark.iconMode !== 'text' && action(text('刷新网站图标', 'Refresh website icon'), RefreshCw, async () => {
          try { await refreshSiteIcon(menu.bookmark); onShowToast?.(text('网站图标已刷新', 'Website icon refreshed')); }
          catch { onShowToast?.(text('未能获取新图标，保留原图标', 'Could not fetch a new icon. Previous icon kept.')); }
        })}
        {separator}
        {action(actionTerm('reveal', language), Library, () => onRevealBookmark(menu.bookmark),
          bookmarkLibraryPath(folders, menu.bookmark.folderId, language === 'en'))}
        {separator}
        {action(actionTerm('removeDesktop', language), EyeOff, () => setConfirmation({
          x: menu.x, y: menu.y, title: actionTerm('removeDesktop', language),
          message: text(`移除「${menu.bookmark.title}」的快捷方式？原收藏和归档目录保持不变。`, 'Remove this shortcut? The library bookmark is kept.'),
          label: text('确认移除快捷方式', 'Confirm shortcut removal'), action: () => onRemoveShortcut(menu.bookmark.id),
        }))}
        {action(actionTerm('deleteBookmark', language), Trash2, () => setConfirmation({
          x: menu.x, y: menu.y, title: text('删除收藏', 'Delete bookmark'),
          message: text(`将「${menu.bookmark.title}」移至回收站并移除快捷方式？可在管理中心恢复收藏。`, 'Move the bookmark to the recycle bin and remove shortcuts? Restore it from Management.'),
          label: text('确认删除收藏', 'Confirm bookmark deletion'), action: () => onDeleteBookmark(menu.bookmark.id),
        }), undefined, true)}
      </div>, document.body)}
    </DesktopDialog>
    {draggedBookmark && drag && !suspended && !cancelingDrag && createPortal(<div data-testid="folder-drag-preview" aria-hidden="true"
      className="desktop-drag-preview" style={{ left: Math.max(0, Math.min(innerWidth - 104, drag.x - 52)), top: Math.max(0, Math.min(innerHeight - 104, drag.y - 36)) }}>
      <div className="desktop-drag-preview-icon"><FaviconImage title={draggedBookmark.title} url={draggedBookmark.url}
        icon={draggedBookmark.icon} iconMode={draggedBookmark.iconMode} iconBg={draggedBookmark.iconBg} showTitle={false} size="lg" className="h-full w-full" /></div>
      <DesktopIconLabel name={draggedBookmark.title} disabled />
    </div>, document.body)}
    {confirmation && <DesktopConfirmPopover confirmation={confirmation} language={language} onClose={() => setConfirmation(null)} />}
  </>;
}
