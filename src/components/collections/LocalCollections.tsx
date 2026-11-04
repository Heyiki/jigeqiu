import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, BookOpen, Check, Copy, Download, Edit2, ExternalLink, Plus,
  Search, Share2, Trash2, X,
} from 'lucide-react';
import type { Bookmark, Collection, CollectionItem, Folder } from '../../types';
import type { CollectionItem as SectionItem } from '../../domain/assets/model';
import {
  collectionSections, collectionMatches, collectionMarkdown,
  exportSingleCollection, safeCollectionFilename,
} from '../../services/collection-content';
import { withCollectionMutation } from '../../services/collection-mutation';
import { FaviconImage } from '../common/FaviconImage';
import { Modal } from '../common/Modal';
import { BatchOpenModal } from './BatchOpenModal';
import { CollectionEditor } from './CollectionEditor';

export interface LocalCollectionsProps {
  collections: Collection[];
  allBookmarks: Bookmark[];
  folders?: Folder[];
  language: string;
  activeCollection: Collection | null;
  onSelect: (collection: Collection | null) => void;
  onCreate: (data: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>) => void | Promise<void>;
  onUpdate: (collection: Collection) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onClone: (collection: Collection) => void | Promise<void>;
  onSaveBookmark: (item: CollectionItem) => void;
}

function legacyItem(item: SectionItem, order: number): CollectionItem {
  let domain = item.url;
  try { domain = new URL(item.url).hostname; } catch { /* Keep malformed legacy URLs readable. */ }
  return {
    bookmarkId: item.bookmarkId ?? '', title: item.title, url: item.url, domain, order,
    icon: item.icon?.kind === 'url' ? item.icon.value : undefined,
    iconMode: item.icon?.kind === 'monogram' ? 'text' : item.icon?.mode,
    iconBg: item.icon?.color ?? undefined,
    recommendationReason: item.recommendationReason,
  };
}

const iconButton = 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-white/10';
const commandButton = 'inline-flex min-h-9 max-w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-40 dark:border-white/20 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-white/10';

export function LocalCollections({
  collections, allBookmarks, folders = [], language, activeCollection, onSelect,
  onCreate, onUpdate, onDelete, onClone, onSaveBookmark,
}: LocalCollectionsProps) {
  const english = language.toLowerCase().startsWith('en');
  const text = (en: string, zh: string) => english ? en : zh;
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{ collection?: Collection } | null>(null);
  const [deleting, setDeleting] = useState<Collection | null>(null);
  const [sharing, setSharing] = useState<Collection | null>(null);
  const [batch, setBatch] = useState<Collection | null>(null);
  const [error, setError] = useState('');
  const [shareError, setShareError] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedUrls, setSavedUrls] = useState<Set<string>>(() => new Set());
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const current = activeCollection
    ? collections.find(collection => collection.id === activeCollection.id) ?? activeCollection : null;
  const matches = useMemo(() => collections.filter(collection => collectionMatches(collection, query)), [collections, query]);
  const saved = useMemo(() => new Set(allBookmarks.map(bookmark => bookmark.url)), [allBookmarks]);
  const sections = useMemo(() => current ? collectionSections(current) : [], [current]);
  const itemCount = (collection: Collection) =>
    collectionSections(collection).reduce((count, section) => count + section.items.length, 0);
  const errorMessage = (cause: unknown) => {
    const code = cause instanceof DOMException && cause.name === 'QuotaExceededError'
      ? 'QUOTA_EXCEEDED' : cause instanceof Error ? cause.message
        : typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : '';
    switch (code) {
      case 'CONFLICT':
      case 'PREVIEW_STALE':
        return text('The data has changed. Refresh the page, then try again. Keep any unsaved edits first.',
          '数据已发生变化，请先保留未保存的修改，再刷新页面重试。');
      case 'QUOTA_EXCEEDED':
        return text('Browser storage is full. Export a backup, free up storage space, then try again.',
          '浏览器存储空间不足，请先导出备份，释放空间后重试。');
      case 'STORAGE_UNAVAILABLE':
      case 'SecurityError':
        return text('Browser storage is unavailable. Check site storage permissions or private browsing settings, then try again.',
          '浏览器存储不可用，请检查本站存储权限或隐私浏览设置后重试。');
      case 'STORAGE_WRITE_FAILED':
        return text('Could not save to browser storage. Close other tabs for this app, then try again.',
          '未能写入浏览器存储，请关闭本应用的其他标签页后重试。');
      case 'LOCK_UNAVAILABLE':
        return text('Saving requires a secure context (HTTPS or localhost) and a browser that supports Web Locks. Open the app in a supported browser using HTTPS or localhost, then retry.',
          '保存需要安全上下文（HTTPS 或 localhost）和支持 Web Locks 的浏览器。请使用支持的浏览器，通过 HTTPS 或 localhost 打开应用后重试。');
      case 'COMMIT_UNCERTAIN':
        return text('The save result is uncertain. Refresh and check the collection before retrying to avoid duplicates.',
          '保存结果尚不确定，请刷新并检查网址单后再决定是否重试，避免重复。');
      case 'CORRUPT_DATA':
      case 'UNSUPPORTED_VERSION':
        return text('Stored data could not be read. Keep your backup and reload the app before retrying.',
          '无法读取已存数据，请保留备份，重新加载应用后重试。');
      case 'NOT_FOUND':
        return text('This collection no longer exists. Refresh the page to load the current list.',
          '此网址单已不存在，请刷新页面获取最新列表。');
      case 'INVALID_URL':
      case 'INVALID_INPUT':
      case 'INVALID_REFERENCE':
        return text('Check the collection title and website URLs, then save again.',
          '请检查网址单标题和条目网址后重新保存。');
      default:
        return code && !/^[A-Z][A-Z0-9_]+$/.test(code) ? code
          : text('Operation failed. Check browser storage and refresh the page before retrying.',
            '操作失败，请检查浏览器存储并刷新页面后重试。');
    }
  };
  const sharePreview = useMemo(() => {
    if (!sharing) return { markdown: '', error: '' };
    try { return { markdown: collectionMarkdown(sharing), error: '' }; }
    catch {
      return { markdown: '', error: english
        ? 'Cannot export this collection. Edit invalid URLs and try again.'
        : '无法导出此网址单，请编辑无效网址后重试。' };
    }
  }, [sharing, english]);

  const run = async (action: () => void | Promise<void>, onSuccess?: () => void) => {
    if (!mounted.current || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await withCollectionMutation(action, () => mounted.current);
      if (mounted.current) onSuccess?.();
    }
    catch (cause) { if (mounted.current) setError(errorMessage(cause)); }
    finally {
      if (mounted.current) { pending.current = false; setBusy(false); }
    }
  };
  const save = async (data: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!mounted.current) throw new Error('CANCELLED');
    if (pending.current) throw new Error(text('Please wait for the current operation.', '请等待当前操作完成。'));
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const original = editor?.collection;
      await withCollectionMutation(() => original
        ? onUpdate({ ...original, ...data, id: original.id, createdAt: original.createdAt, updatedAt: Date.now() })
        : onCreate(data), () => mounted.current);
      if (mounted.current) setEditor(null);
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
      throw cause;
    } finally {
      if (mounted.current) { pending.current = false; setBusy(false); }
    }
  };
  const closeEditor = () => { if (!pending.current) setEditor(null); };
  const showShare = (collection: Collection) => {
    setShareError('');
    setCopied(false);
    setSharing(collection);
  };
  const copyMarkdown = async () => {
    if (!mounted.current || !sharing || sharePreview.error || pending.current) return;
    pending.current = true;
    setBusy(true);
    setCopied(false);
    setShareError('');
    try {
      await navigator.clipboard.writeText(sharePreview.markdown);
      if (mounted.current) setCopied(true);
    } catch {
      if (mounted.current) setShareError(text('Could not copy. Select and copy the Markdown below.', '复制失败，请选择下方 Markdown 手动复制。'));
    } finally {
      if (mounted.current) { pending.current = false; setBusy(false); }
    }
  };
  const downloadJson = () => {
    if (!sharing) return;
    setShareError('');
    let url: string | undefined;
    let anchor: HTMLAnchorElement | undefined;
    try {
      const json = exportSingleCollection(sharing);
      url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
      anchor = document.createElement('a');
      anchor.href = url;
      const filename = safeCollectionFilename(sharing.title);
      anchor.download = filename.endsWith('.json') ? filename : `${filename}.json`;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
    } catch (cause) { setShareError(errorMessage(cause)); }
    finally {
      anchor?.remove();
      if (url) URL.revokeObjectURL(url);
    }
  };
  const saveItem = async (item: CollectionItem) => {
    await run(() => onSaveBookmark(item), () => {
      setSavedUrls(previous => new Set([...previous, item.url]));
    });
  };
  const actions = (collection: Collection) => (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      <button type="button" className={iconButton} disabled={busy}
        title={text('Edit collection', '编辑网址单')} aria-label={text(`Edit ${collection.title}`, `编辑 ${collection.title}`)}
        onClick={() => { setError(''); setEditor({ collection }); }}><Edit2 size={16} /></button>
      <button type="button" className={iconButton} disabled={busy}
        title={text('Duplicate collection', '复制网址单')} aria-label={text(`Duplicate ${collection.title}`, `复制 ${collection.title}`)}
        onClick={() => run(() => onClone(collection))}><Copy size={16} /></button>
      <button type="button" className={iconButton} disabled={busy}
        title={text('Share collection', '分享网址单')} aria-label={text(`Share ${collection.title}`, `分享 ${collection.title}`)}
        onClick={() => showShare(collection)}><Share2 size={16} /></button>
      <button type="button" className={`${iconButton} hover:!text-rose-600`} disabled={busy}
        title={text('Delete collection', '删除网址单')} aria-label={text(`Delete ${collection.title}`, `删除 ${collection.title}`)}
        onClick={() => { setError(''); setDeleting(collection); }}><Trash2 size={16} /></button>
    </div>
  );
  const close = (onClose: () => void) => (
    <button type="button" className={`${iconButton} absolute right-3 top-3`} disabled={busy}
      title={text('Close', '关闭')} aria-label={text('Close', '关闭')} onClick={onClose}><X size={18} /></button>
  );

  return (
    <div className="w-full min-w-0 text-zinc-900 dark:text-zinc-100 [letter-spacing:0] [&_[role=dialog]]:!rounded-lg [&_[role=dialog]]:break-words [&_.rounded-3xl]:!rounded-lg [&_.rounded-2xl]:!rounded-lg [&_.rounded-xl]:!rounded-lg [&_.rounded-full]:!rounded-lg">
      {error && <p role="alert" className="mb-4 whitespace-pre-wrap break-words rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">{error}</p>}
      {current ? (
        <>
          <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <button type="button" className={commandButton} onClick={() => onSelect(null)}
              title={text('Back to My Collections', '返回我的网址单')} aria-label={text('Back to My Collections', '返回我的网址单')}>
              <ArrowLeft size={16} className="shrink-0" /><span>{text('My collections', '我的网址单')}</span>
            </button>
            {actions(current)}
          </div>
          <header className="min-w-0 border-b border-zinc-200 pb-5 dark:border-white/15">
            {current.assetContent?.cover?.kind === 'url' && <img src={current.assetContent.cover.url}
              alt="" className="mb-4 max-h-64 w-full rounded-lg object-contain" />}
            <h2 className="break-words text-xl font-semibold [overflow-wrap:anywhere]">{current.title}</h2>
            {current.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-600 dark:text-zinc-300 [overflow-wrap:anywhere]">{current.description}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{itemCount(current)} {text('websites', '个网址')}</span>
              <button type="button" className={commandButton} disabled={itemCount(current) === 0}
                title={text('Open all websites', '批量打开网址')} aria-label={text(`Open all ${current.title}`, `批量打开 ${current.title}`)}
                onClick={() => setBatch(current)}><ExternalLink size={15} className="shrink-0" />{text('Open all', '批量打开')}</button>
            </div>
          </header>
          <div className="divide-y divide-zinc-200 dark:divide-white/15">
            {sections.map(section => (
              <section key={section.id} className="min-w-0 py-6">
                {section.title && <h3 className="break-words text-base font-semibold [overflow-wrap:anywhere]">{section.title}</h3>}
                {section.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-600 dark:text-zinc-300 [overflow-wrap:anywhere]">{section.description}</p>}
                {!section.items.length && <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">{text('No websites in this section.', '此章节暂无网址。')}</p>}
                <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/10">
                  {section.items.map((entry, index) => {
                    const item = legacyItem(entry, index);
                    const alreadySaved = saved.has(item.url) || savedUrls.has(item.url);
                    return <li key={entry.id} className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-start">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <FaviconImage url={item.url} title={item.title} icon={item.icon} iconMode={item.iconMode} iconBg={item.iconBg} size="md" />
                        <div className="min-w-0 flex-1">
                          <h4 className="break-words text-sm font-semibold [overflow-wrap:anywhere]">{item.title}</h4>
                          <p className="mt-1 break-all text-xs text-zinc-500 dark:text-zinc-400">{item.domain}</p>
                          {item.recommendationReason && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-600 dark:text-zinc-300 [overflow-wrap:anywhere]">{item.recommendationReason}</p>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 sm:pl-2">
                        <button type="button" className={commandButton} disabled={alreadySaved || busy}
                          title={text(alreadySaved ? 'Already saved' : 'Save bookmark', alreadySaved ? '已有收藏' : '收藏网址')}
                          aria-label={text(`${alreadySaved ? 'Already saved' : 'Save'} ${item.title}`, `${alreadySaved ? '已有收藏' : '收藏'} ${item.title}`)}
                          onClick={() => saveItem(item)}>
                          {alreadySaved ? <Check size={15} className="shrink-0" /> : <Plus size={15} className="shrink-0" />}
                          {text(alreadySaved ? 'Saved' : 'Save', alreadySaved ? '已有收藏' : '收藏')}
                        </button>
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className={commandButton}
                          title={text('Visit website', '访问网址')} aria-label={text(`Visit ${item.title}`, `访问 ${item.title}`)}>
                          <ExternalLink size={15} className="shrink-0" />{text('Visit', '访问')}
                        </a>
                      </div>
                    </li>;
                  })}
                </ul>
              </section>
            ))}
          </div>
          {!!current.assetContent?.provenance.length && (
            <section className="min-w-0 border-t border-zinc-200 py-5 dark:border-white/15">
              <h3 className="text-sm font-semibold">{text('Sources', '来源记录')}</h3>
              <ul className="mt-3 space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
                {current.assetContent.provenance.map((source, index) => (
                  <li key={`${source.sourceId}:${index}`} className="min-w-0 space-y-1 whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {source.title && <p className="font-medium">{source.title}</p>}
                    {source.author && <p>{text('Author: ', '作者：')}{source.author}</p>}
                    <p>{text('Source ID: ', '来源 ID：')}{source.sourceId}</p>
                    {source.url && <p>{source.url}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <>
          <div className="mb-4 flex min-w-0 flex-wrap items-center gap-3">
            <div className="relative block min-w-0 flex-1 basis-44">
              <Search size={16} className="pointer-events-none absolute left-3 top-3 text-zinc-500" />
              <input ref={searchInput} type="search" value={query} aria-label={text('Search collections', '搜索网址单')}
                placeholder={text('Search collections', '搜索网址单')} onChange={event => setQuery(event.target.value)}
                className="h-10 w-full min-w-0 rounded-lg border border-zinc-300 bg-white pl-9 pr-11 text-sm outline-none focus:ring-2 focus:ring-emerald-600 dark:border-white/20 dark:bg-zinc-900 [&::-webkit-search-cancel-button]:appearance-none" />
              {query && <button type="button" className={`${iconButton} absolute right-0.5 top-0.5`}
                title={text('Clear search', '清空搜索')} aria-label={text('Clear search', '清空搜索')}
                onClick={() => { setQuery(''); searchInput.current?.focus(); }}><X size={16} /></button>}
            </div>
            <button type="button" className={commandButton} disabled={busy}
              aria-label={text('New collection', '新建网址单')} title={text('New collection', '新建网址单')}
              onClick={() => { setError(''); setEditor({}); }}><Plus size={16} className="shrink-0" />{text('New collection', '新建网址单')}</button>
          </div>
          {!matches.length && <div className="border-y border-zinc-200 py-12 text-center dark:border-white/15">
            <BookOpen size={28} className="mx-auto mb-3 text-zinc-400" />
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{query.trim()
              ? text('No matching collections.', '未找到匹配的网址单。') : text('No collections yet.', '暂无网址单。')}</p>
          </div>}
          <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {matches.map(collection => <article key={collection.id} className="flex min-w-0 flex-col rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/15 dark:bg-zinc-900">
              <button type="button" className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-emerald-600"
                aria-label={text(`Open ${collection.title}`, `打开 ${collection.title}`)} onClick={() => onSelect(collection)}>
                {collection.assetContent?.cover?.kind === 'url'
                  ? <img src={collection.assetContent.cover.url} alt="" className="mb-3 h-28 w-full rounded-lg object-contain" />
                  : <BookOpen size={22} className="mb-3 text-emerald-700 dark:text-emerald-400" />}
                <h3 className="break-words text-base font-semibold [overflow-wrap:anywhere]">{collection.title}</h3>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-600 dark:text-zinc-300 [overflow-wrap:anywhere]">{collection.description}</p>
              </button>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 dark:border-white/10">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{itemCount(collection)} {text('websites', '个网址')}</span>
                {actions(collection)}
              </div>
            </article>)}
          </div>
        </>
      )}

      {editor && <CollectionEditor collection={editor.collection} allBookmarks={allBookmarks} folders={folders}
        language={language} onSave={save} onClose={closeEditor} />}
      {batch && <BatchOpenModal key={batch.id} isOpen language={language} onClose={() => setBatch(null)} collectionTitle={batch.title}
        items={collectionSections(batch).flatMap(section => section.items).map(legacyItem)} />}
      {sharing && <Modal isOpen contained showCloseButton={false} maxWidth="xl"
        title={text('Share collection', '分享网址单')} onClose={() => { if (!pending.current) setSharing(null); }}>
        {close(() => setSharing(null))}
        <div className="min-w-0 space-y-4">
          <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{sharing.title}</p>
          <p className="break-words text-xs leading-5 text-zinc-600 dark:text-zinc-300">{text(
            'Review body text, URL parameters and item introductions for sensitive information before sharing.',
            '分享前请检查正文、网址参数及条目介绍中是否含有敏感信息。',
          )}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={commandButton} disabled={busy || !!sharePreview.error}
              title={text('Copy Markdown', '复制 Markdown')} aria-label={text('Copy Markdown', '复制 Markdown')}
              onClick={copyMarkdown}><Copy size={16} className="shrink-0" />{text('Copy Markdown', '复制 Markdown')}</button>
            <button type="button" className={commandButton} disabled={busy}
              title={text('Download JSON', '下载 JSON')} aria-label={text('Download JSON', '下载 JSON')}
              onClick={downloadJson}><Download size={16} className="shrink-0" />{text('Download JSON', '下载 JSON')}</button>
          </div>
          {copied && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{text('Markdown copied.', 'Markdown 已复制。')}</p>}
          {shareError && <p role="alert" className="break-words text-sm text-rose-700 dark:text-rose-300">{shareError}</p>}
          {sharePreview.error && <p role="alert" className="break-words text-sm text-rose-700 dark:text-rose-300">{sharePreview.error}</p>}
          <textarea readOnly aria-label="Markdown" value={sharePreview.markdown}
            className="h-64 w-full min-w-0 resize-y rounded-lg border border-zinc-300 bg-zinc-50 p-3 font-mono text-xs leading-6 text-zinc-800 dark:border-white/20 dark:bg-zinc-950 dark:text-zinc-200" />
        </div>
      </Modal>}
      {deleting && <Modal isOpen contained showCloseButton={false} maxWidth="sm"
        title={text('Delete collection?', '删除网址单？')} onClose={() => { if (!pending.current) setDeleting(null); }}>
        {close(() => setDeleting(null))}
        <p className="break-words text-sm leading-6 [overflow-wrap:anywhere]">{text(
          `Delete "${deleting.title}"? This cannot be undone. Your original bookmarks will not be deleted.`,
          `确定删除「${deleting.title}」？此操作不可恢复，不会删除原收藏。`,
        )}</p>
        {error && <p role="alert" className="mt-3 break-words text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className={commandButton} disabled={busy} onClick={() => setDeleting(null)}>{text('Cancel', '取消')}</button>
          <button type="button" className={`${commandButton} !border-rose-600 !bg-rose-600 !text-white hover:!bg-rose-700`} disabled={busy}
            aria-label={text('Confirm deletion', '确认删除')} onClick={() => run(() => onDelete(deleting.id), () => {
              setDeleting(null);
              if (current?.id === deleting.id) onSelect(null);
            })}><Trash2 size={15} className="shrink-0" />{text('Delete', '删除')}</button>
        </div>
      </Modal>}
    </div>
  );
}
