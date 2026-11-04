import React, { useState, useEffect, useMemo } from 'react';
import { Collection, Category, Bookmark, Folder } from '../../types';
import { BookmarkTreeSelect } from '../common/BookmarkTreeSelect';
import {
  Layers,
  Plus,
  Copy,
  ExternalLink,
  Share2,
  Trash2,
  Pin,
  PinOff,
  Lock,
  Globe,
  Link as LinkIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { BatchOpenModal } from './BatchOpenModal';
import { FaviconImage } from '../common/FaviconImage';

interface CollectionsViewProps {
  localOnly?: boolean;
  embedded?: boolean;
  language?: string;
  collections: Collection[];
  categories: Category[];
  allBookmarks: Bookmark[];
  folders?: Folder[];
  onSelectCollection: (collection: Collection) => void;
  onCreateCollection: (data: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCloneCollection: (collection: Collection) => void;
  onDeleteCollection: (collectionId: string) => void;
  onTogglePinCollection: (collectionId: string) => void;
  onShareCollection: (collection: Collection) => void;
}

export const CollectionsView: React.FC<CollectionsViewProps> = ({
  collections,
  categories,
  allBookmarks,
  folders = [],
  onSelectCollection,
  onCreateCollection,
  onCloneCollection,
  onDeleteCollection,
  onTogglePinCollection,
  onShareCollection,
  localOnly = false,
  embedded = false,
  language = 'zh',
}) => {
  const english = language.toLowerCase().startsWith('en');
  const pageTitle = english ? 'My Collections' : '我的网址单';
  const createLabel = english ? 'New Collection' : '新建网址单';
  const [activeTab, setActiveTab] = useState<'created' | 'favorited' | 'cloned'>('created');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [batchOpenTarget, setBatchOpenTarget] = useState<Collection | null>(null);

  // Create Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(categories[0]?.id || 'cat-work');
  const [visibility, setVisibility] = useState<'private' | 'public' | 'unlisted'>('public');
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<string[]>([]);

  // Filter collections by tab
  const filteredCollections = useMemo(() => {
    if (localOnly) return collections;
    return collections.filter(c => {
      if (activeTab === 'cloned') return c.isCloned;
      if (activeTab === 'favorited') return c.isFavorited;
      return !c.isCloned; // created by user
    });
  }, [collections, activeTab, localOnly]);

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);

  // Reset page when tab or pageSize changes
  useEffect(() => {
    setPage(1);
  }, [activeTab, pageSize, localOnly]);

  useEffect(() => {
    setPage(current => Math.min(current, Math.max(1, Math.ceil(filteredCollections.length / pageSize))));
  }, [filteredCollections.length, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredCollections.length / pageSize));
  const paginatedCollections = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredCollections.slice(start, start + pageSize);
  }, [filteredCollections, page, pageSize]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const items = selectedBookmarkIds
      .map((id, index) => {
        const bm = allBookmarks.find(b => b.id === id);
        if (!bm) return null;
        return {
          bookmarkId: bm.id,
          title: bm.title,
          url: bm.url,
          domain: bm.domain,
          icon: bm.icon,
          iconMode: bm.iconMode,
          iconBg: bm.iconBg,
          order: index + 1,
          recommendationReason: bm.notes || '实用推荐',
        };
      })
      .filter(Boolean) as any[];

    const gradients = [
      'from-blue-600 to-indigo-700',
      'from-cyan-600 to-blue-800',
      'from-purple-600 to-indigo-800',
      'from-amber-500 to-orange-600',
      'from-emerald-500 to-teal-700',
      'from-pink-500 to-rose-700',
    ];
    const coverGradient = gradients[Math.floor(Math.random() * gradients.length)];

    onCreateCollection({
      title: title.trim(),
      description: description.trim(),
      category,
      tags: [],
      authorId: 'user-me',
      authorName: '我',
      visibility: localOnly ? 'private' : visibility,
      items,
      isPinnedToDesktop: false,
      coverGradient,
    });

    setTitle('');
    setDescription('');
    setSelectedBookmarkIds([]);
    setIsCreateOpen(false);
  };

  return (
    <div className={embedded ? 'w-full min-w-0' : 'w-full max-w-6xl mx-auto px-4 sm:px-8 py-8'}>
      {/* Header */}
      <div className={embedded
        ? 'flex flex-wrap items-center justify-end gap-3 mb-5'
        : 'liquid-glass rounded-3xl p-5 sm:p-6 mb-8 border border-slate-300/90 dark:border-white/10 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4'}>
        {!embedded && <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/20 shadow-2xs">
            <Layers size={24} />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 dark:text-slate-100">
              {localOnly ? pageTitle : '网址单管理与分享'}
            </h1>
            {!localOnly && !embedded && (
            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium mt-1">
              将高频网址整理成主题集合，支持一键打开、复制为副本及向社区分享
            </p>
            )}
          </div>
        </div>}

        <button
          onClick={() => setIsCreateOpen(true)}
          className={`flex items-center gap-2 px-4 py-2.5 ${embedded ? 'rounded-lg' : 'rounded-2xl'} bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold transition-colors shadow-sm shrink-0 cursor-pointer`}
        >
          <Plus size={16} />
          <span>{localOnly || embedded ? createLabel : '新建网址单'}</span>
        </button>
      </div>

      {/* Segmented Filter Tabs */}
      {!localOnly && <div className="flex items-center gap-2 mb-6">
        <div className="flex items-center gap-1 p-1 rounded-2xl liquid-glass text-xs">
          <button
            onClick={() => setActiveTab('created')}
            className={`px-3.5 py-1.5 rounded-xl font-medium transition-colors ${
              activeTab === 'created'
                ? 'bg-white/80 dark:bg-white/20 text-sky-600 dark:text-sky-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            我创建的 ({collections.filter(c => !c.isCloned).length})
          </button>
          <button
            onClick={() => setActiveTab('favorited')}
            className={`px-3.5 py-1.5 rounded-xl font-medium transition-colors ${
              activeTab === 'favorited'
                ? 'bg-white/80 dark:bg-white/20 text-sky-600 dark:text-sky-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            我收藏的 ({collections.filter(c => c.isFavorited).length})
          </button>
          <button
            onClick={() => setActiveTab('cloned')}
            className={`px-3.5 py-1.5 rounded-xl font-medium transition-colors ${
              activeTab === 'cloned'
                ? 'bg-white/80 dark:bg-white/20 text-sky-600 dark:text-sky-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            我复制的 ({collections.filter(c => c.isCloned).length})
          </button>
        </div>
      </div>}

      {/* Grid of Collection Cards */}
      {filteredCollections.length === 0 ? (
        <div className={embedded ? 'py-12 text-center' : 'py-20 text-center liquid-glass rounded-3xl p-8'}>
          <Layers size={36} className="mx-auto text-slate-400 mb-3 opacity-60" />
          <h3 className="text-base font-medium text-slate-700 dark:text-slate-200 mb-1">
            暂无相关网址单
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            {localOnly || activeTab === 'created'
              ? '点击上方“新建网址单”快速整理您的第一个网址集合'
              : '可在“探索”页面发现社区优质网址单并一键收藏或复制'}
          </p>
          {(localOnly || activeTab === 'created') && (
            <button
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 text-white text-xs font-medium"
            >
              <Plus size={14} />
              <span>{localOnly || embedded ? createLabel : '新建网址单'}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedCollections.map(col => (
            <div
              key={col.id}
              className={`liquid-glass ${embedded ? 'rounded-lg' : 'rounded-3xl'} overflow-hidden border border-white/60 dark:border-white/10 shadow-lg flex flex-col justify-between group hover:border-sky-500/30 transition-all duration-200`}
            >
              {/* Card Banner / Header */}
              <div
                onClick={() => onSelectCollection(col)}
                className={`h-24 bg-gradient-to-r ${col.coverGradient || 'from-sky-500 to-indigo-600'} p-4 flex flex-col justify-between text-white relative cursor-pointer overflow-hidden`}
              >
                <div className="flex items-center justify-between text-xs">
                  {/* Visibility tag */}
                  {!localOnly && <span className="flex items-center gap-1 bg-black/25 backdrop-blur-xs px-2 py-0.5 rounded-full text-[10px]">
                    {col.visibility === 'private' && <Lock size={10} />}
                    {col.visibility === 'public' && <Globe size={10} />}
                    {col.visibility === 'unlisted' && <LinkIcon size={10} />}
                    <span>
                      {col.visibility === 'private'
                        ? '私密'
                        : col.visibility === 'public'
                        ? '公开'
                        : '仅链接可见'}
                    </span>
                  </span>}

                  {col.isCloned && (
                    <span className="bg-white/20 backdrop-blur-xs px-2 py-0.5 rounded-full text-[10px]">
                      副本
                    </span>
                  )}
                </div>

                <div className="truncate">
                  <h3 className="text-base font-bold drop-shadow-xs truncate">
                    {col.title}
                  </h3>
                  <span className="text-[11px] opacity-80">
                    {!localOnly && <>由 {col.authorName} 创建 · </>}{col.items.length} 个网址
                  </span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed mb-3">
                    {col.description || '暂无详细描述'}
                  </p>

                  {/* Preview Icons Row */}
                  <div className="flex items-center gap-2 mb-4 overflow-hidden">
                    {col.items.slice(0, 5).map((item, idx) => (
                      <FaviconImage
                        key={idx}
                        url={item.url}
                        title={item.title}
                        icon={item.icon}
                        iconMode={item.iconMode}
                        iconBg={item.iconBg}
                        size="sm"
                      />
                    ))}
                    {col.items.length > 5 && (
                      <span className="text-[11px] font-mono text-slate-400 bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">
                        +{col.items.length - 5}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Actions Bottom */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-200/40 dark:border-white/10 text-xs">
                  <div className="flex items-center gap-2">
                    {/* Batch Open Trigger */}
                    <button
                      onClick={() => setBatchOpenTarget(col)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-300 hover:bg-sky-500/20 font-medium transition-colors"
                      title="打开一组网址"
                    >
                      <ExternalLink size={13} />
                      <span>打开一组</span>
                    </button>

                    {/* Clone button */}
                    <button
                      onClick={() => onCloneCollection(col)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      title="复制为我的网址单"
                    >
                      <Copy size={14} />
                    </button>

                    {/* Share button */}
                    {!localOnly && <button
                      onClick={() => onShareCollection(col)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      title="复制分享链接"
                    >
                      <Share2 size={14} />
                    </button>}

                    {/* Pin to desktop toggle */}
                    {!localOnly && <button
                      onClick={() => onTogglePinCollection(col.id)}
                      className={`p-1.5 rounded-xl transition-colors ${
                        col.isPinnedToDesktop
                          ? 'text-sky-500 bg-sky-500/10'
                          : 'text-slate-400 hover:text-slate-700 hover:bg-black/5'
                      }`}
                      title={col.isPinnedToDesktop ? '从桌面取消固定' : '固定网址单到桌面'}
                    >
                      {col.isPinnedToDesktop ? <PinOff size={14} /> : <Pin size={14} />}
                    </button>}
                  </div>

                  {/* Delete button (if user created) */}
                  {(localOnly || (!col.isCloned && col.authorId === 'user-me')) && (
                    <button
                      onClick={() => {
                        if (confirm(`确定删除网址单「${col.title}」吗？`)) {
                          onDeleteCollection(col.id);
                        }
                      }}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-rose-500 transition-colors"
                      title="删除网址单"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Toolbar for Collections */}
      {filteredCollections.length > 0 && (
        <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 text-xs ${embedded ? 'py-3 border-t border-slate-200 dark:border-white/10' : 'p-4 rounded-2xl liquid-glass border border-slate-300/80 dark:border-white/10 shadow-xs'}`}>
          {/* Left: Total & Page size selector */}
          <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
            <span>
              共 <strong className="text-slate-900 dark:text-white font-bold">{filteredCollections.length}</strong> 个网址单
            </span>
            <span className="text-slate-300 dark:text-white/15">|</span>
            <div className="flex items-center gap-1.5">
              <span>每页显示</span>
              <select
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
                className="px-2 py-1 rounded-lg bg-black/5 dark:bg-slate-800 border border-slate-200/60 dark:border-white/10 text-xs font-semibold focus:outline-none cursor-pointer"
              >
                <option value={6}>6 个</option>
                <option value={9}>9 个</option>
                <option value={12}>12 个</option>
                <option value={18}>18 个</option>
              </select>
            </div>
          </div>

          {/* Right: Page navigation */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage(1)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                title="第一页"
              >
                <ChevronsLeft size={14} />
              </button>
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                className="px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer font-medium transition-colors"
              >
                上一页
              </button>

              <div className="flex items-center gap-1 px-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | string)[]>((acc, p, idx, arr) => {
                    if (idx > 0 && typeof arr[idx - 1] === 'number') {
                      const prev = arr[idx - 1] as number;
                      if (p - prev > 1) {
                        acc.push(`dots-${p}`);
                      }
                    }
                    acc.push(p);
                    return acc;
                  }, [])
                  .map(item => {
                    if (typeof item === 'string') {
                      return (
                        <span key={item} className="px-1 text-slate-400">
                          ...
                        </span>
                      );
                    }
                    const isCurrent = item === page;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setPage(item)}
                        className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          isCurrent
                            ? 'bg-sky-500 text-white shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/10'
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}
              </div>

              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                className="px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer font-medium transition-colors"
              >
                下一页
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                title="最后一页"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Create Collection Modal */}
      {isCreateOpen && (
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          maxWidth="lg"
          title={localOnly || embedded ? createLabel : '创建新网址单'}
        >
          <form onSubmit={handleCreateSubmit} className="space-y-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                网址单标题 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="例如：独立开发者工具箱"
                required
                className="w-full px-3.5 py-2 text-sm rounded-xl bg-black/5 dark:bg-white/10 border border-slate-200/60 dark:border-white/10 focus:outline-none focus:border-sky-500 text-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                简介说明
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="简述这个网址集合的适用场景与价值..."
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-black/5 dark:bg-white/10 border border-slate-200/60 dark:border-white/10 focus:outline-none focus:border-sky-500 text-slate-800 dark:text-slate-100 h-20 resize-none"
              />
            </div>

            {!localOnly && <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  归属分类
                </label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-black/5 dark:bg-slate-800 border border-slate-200/60 dark:border-white/10 text-slate-800 dark:text-slate-100"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  分享可见性
                </label>
                <select
                  value={visibility}
                  onChange={e => setVisibility(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-black/5 dark:bg-slate-800 border border-slate-200/60 dark:border-white/10 text-slate-800 dark:text-slate-100"
                >
                  <option value="public">公开 (展示在社区与个人主页)</option>
                  <option value="unlisted">仅链接可见 (拥有链接即可查看)</option>
                  <option value="private">私密 (仅自己可见)</option>
                </select>
              </div>
            </div>}

            {/* Select Bookmarks */}
            <BookmarkTreeSelect bookmarks={allBookmarks} folders={folders} language={language}
              multiple value={selectedBookmarkIds} onChange={setSelectedBookmarkIds} />

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200/50 dark:border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="px-3.5 py-2 rounded-xl text-slate-500 hover:bg-black/5 transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-medium transition-colors shadow-sm"
              >
                创建网址单
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Batch Open Modal */}
      {batchOpenTarget && (
        <BatchOpenModal
          isOpen={Boolean(batchOpenTarget)}
          onClose={() => setBatchOpenTarget(null)}
          collectionTitle={batchOpenTarget.title}
          items={batchOpenTarget.items}
        />
      )}
    </div>
  );
};
