import React, { useState, useMemo } from 'react';
import { Collection, Bookmark } from '../../types';
import {
  ArrowLeft,
  ExternalLink,
  Copy,
  Share2,
  Pin,
  PinOff,
  Plus,
  Check,
  Globe,
  Lock,
  Link as LinkIcon,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { FaviconImage } from '../common/FaviconImage';
import { BatchOpenModal } from './BatchOpenModal';

interface CollectionDetailViewProps {
  localOnly?: boolean;
  embedded?: boolean;
  language?: string;
  collection: Collection;
  userBookmarks: Bookmark[];
  onBack: () => void;
  onClone: (collection: Collection) => void;
  onShare: (collection: Collection) => void;
  onTogglePin: (collectionId: string) => void;
  onSaveBookmarkToMyLibrary: (item: any) => void;
}

export const CollectionDetailView: React.FC<CollectionDetailViewProps> = ({
  collection,
  userBookmarks,
  onBack,
  onClone,
  onShare,
  onTogglePin,
  onSaveBookmarkToMyLibrary,
  localOnly = false,
  embedded = false,
  language = 'zh',
}) => {
  const english = language.toLowerCase().startsWith('en');
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [savedUrls, setSavedUrls] = useState<string[]>([]);
  const [itemPage, setItemPage] = useState(1);
  const [itemPageSize, setItemPageSize] = useState(8);

  const totalPages = Math.max(1, Math.ceil(collection.items.length / itemPageSize));
  const paginatedItems = useMemo(() => {
    const start = (itemPage - 1) * itemPageSize;
    return collection.items.slice(start, start + itemPageSize);
  }, [collection.items, itemPage, itemPageSize]);

  const isAlreadyBookmarked = (url: string) => {
    return userBookmarks.some(
      b => b.url.toLowerCase() === url.toLowerCase()
    );
  };

  const handleSaveItem = (item: any) => {
    onSaveBookmarkToMyLibrary(item);
    setSavedUrls(prev => [...prev, item.url]);
  };

  return (
    <div className={embedded ? 'w-full min-w-0 animate-in fade-in duration-200' : 'w-full max-w-4xl mx-auto px-4 sm:px-8 py-8 animate-in fade-in duration-200'}>
      {/* Top Back Nav */}
      <button
        onClick={onBack}
        className={`flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors ${embedded ? 'mb-3' : 'mb-6'} group`}
      >
        <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
        <span>{localOnly || embedded ? (english ? 'Back to My Collections' : '返回我的网址单') : '返回网址单列表'}</span>
      </button>

      {/* Hero Banner */}
      <div className={embedded ? 'mb-5' : 'liquid-glass rounded-3xl overflow-hidden border border-white/60 dark:border-white/10 shadow-xl mb-8'}>
        <div
          className={embedded
            ? 'min-w-0 text-slate-950 dark:text-slate-100'
            : `h-44 sm:h-52 bg-gradient-to-r ${collection.coverGradient || 'from-sky-500 to-indigo-600'} p-6 sm:p-8 flex flex-col justify-between text-white relative`}
        >
          {!localOnly && <div className={`flex items-center justify-between text-xs ${embedded ? 'mb-3' : ''}`}>
            <span className="flex items-center gap-1.5 bg-black/25 backdrop-blur-md px-3 py-1 rounded-full text-xs">
              {collection.visibility === 'private' && <Lock size={12} />}
              {collection.visibility === 'public' && <Globe size={12} />}
              {collection.visibility === 'unlisted' && <LinkIcon size={12} />}
              <span>
                {collection.visibility === 'private'
                  ? '私密网址单'
                  : collection.visibility === 'public'
                  ? '公开网址单'
                  : '仅链接可见'}
              </span>
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onShare(collection)}
                className="flex items-center gap-1.5 bg-black/25 hover:bg-black/40 backdrop-blur-md px-3 py-1 rounded-full text-xs transition-colors"
              >
                <Share2 size={12} />
                <span>分享</span>
              </button>
            </div>
          </div>}

          <div>
            <h1 className={embedded ? 'text-lg font-semibold break-words' : 'text-2xl sm:text-3xl font-bold tracking-tight drop-shadow-sm'}>
              {collection.title}
            </h1>
            <p className="text-xs sm:text-sm opacity-90 mt-2 max-w-2xl line-clamp-2 leading-relaxed">
              {collection.description}
            </p>
          </div>
        </div>

        {/* Hero Actions Bar */}
        <div className={embedded
          ? 'py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-white/10'
          : 'p-4 sm:p-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/40 dark:border-white/10 bg-white/20 dark:bg-black/10'}>
          {localOnly ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">收录 {collection.items.length} 个网站</span>
          ) : (
          <div className="flex items-center gap-3">
            {collection.authorAvatar ? (
              <img
                src={collection.authorAvatar}
                alt={collection.authorName}
                className="w-9 h-9 rounded-full object-cover border border-white/60"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-sky-500 text-white flex items-center justify-center text-xs font-bold">
                {collection.authorName.charAt(0)}
              </div>
            )}
            <div>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 block">
                {collection.authorName}
              </span>
              <span className="text-[11px] text-slate-400">
                收录 {collection.items.length} 个网站
              </span>
            </div>
          </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowBatchModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium transition-colors shadow-sm"
            >
              <ExternalLink size={14} />
              <span>打开一组 ({collection.items.length})</span>
            </button>

            <button
              onClick={() => onClone(collection)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl liquid-glass hover:bg-black/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors border border-black/5 dark:border-white/10"
              title="将此网址单复制为我的副本，可自由修改"
            >
              <Copy size={13} />
              <span>复制为我的网址单</span>
            </button>

            {!localOnly && <button
              onClick={() => onTogglePin(collection.id)}
              className={`p-2 rounded-xl liquid-glass transition-colors ${
                collection.isPinnedToDesktop
                  ? 'text-sky-500 bg-sky-500/15'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
              title={collection.isPinnedToDesktop ? '从桌面移除' : '固定到桌面首页'}
            >
              {collection.isPinnedToDesktop ? <PinOff size={15} /> : <Pin size={15} />}
            </button>}
          </div>
        </div>
      </div>

      {/* Items List */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider px-1">
          收录网址列表 ({collection.items.length})
        </h2>

        <div className="grid grid-cols-1 gap-3">
          {paginatedItems.map(item => {
            const isBookmarked = isAlreadyBookmarked(item.url) || savedUrls.includes(item.url);

            return (
              <div
                key={item.url}
                className={`liquid-glass ${embedded ? 'rounded-lg' : 'rounded-2xl'} p-4 border border-white/60 dark:border-white/10 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-sky-500/30 transition-all`}
              >
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <FaviconImage
                    url={item.url}
                    title={item.title}
                    icon={item.icon}
                    iconMode={item.iconMode}
                    iconBg={item.iconBg}
                    size="md"
                    className="shrink-0 mt-0.5 sm:mt-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {item.title}
                      </h3>
                      <span className="text-[11px] text-slate-400 font-mono truncate">
                        {item.domain}
                      </span>
                    </div>
                    {item.recommendationReason && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {localOnly ? (english ? 'Note: ' : '条目说明：') : '推荐理由：'}{item.recommendationReason}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {/* Quick Save to my library */}
                  <button
                    onClick={() => handleSaveItem(item)}
                    disabled={isBookmarked}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                      isBookmarked
                        ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10'
                    }`}
                  >
                    {isBookmarked ? (
                      <>
                        <Check size={13} />
                        <span>已收藏</span>
                      </>
                    ) : (
                      <>
                        <Plus size={13} />
                        <span>加入我的收藏</span>
                      </>
                    )}
                  </button>

                  {/* Visit External Site */}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-300 text-xs font-medium transition-colors"
                  >
                    <ExternalLink size={13} />
                    <span>访问</span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {/* Collection items pagination */}
        {collection.items.length > itemPageSize && (
          <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 text-xs ${embedded ? 'py-3 border-t border-slate-200 dark:border-white/10' : 'p-3 rounded-2xl liquid-glass border border-white/60 dark:border-white/10 shadow-xs'}`}>
            <span className="text-slate-500 dark:text-slate-400">
              共 <strong>{collection.items.length}</strong> 个网址 · 第 {itemPage}/{totalPages} 页
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={itemPage === 1}
                onClick={() => setItemPage(1)}
                className="p-1 rounded-lg text-slate-500 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="第一页"
              >
                <ChevronsLeft size={14} />
              </button>
              <button
                disabled={itemPage === 1}
                onClick={() => setItemPage(prev => Math.max(1, prev - 1))}
                className="px-2 py-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer font-medium"
              >
                上一页
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setItemPage(p)}
                    className={`w-6 h-6 rounded-lg text-xs font-semibold cursor-pointer ${
                      p === itemPage
                        ? 'bg-sky-500 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/10'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                disabled={itemPage >= totalPages}
                onClick={() => setItemPage(prev => Math.min(totalPages, prev + 1))}
                className="px-2 py-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer font-medium"
              >
                下一页
              </button>
              <button
                disabled={itemPage >= totalPages}
                onClick={() => setItemPage(totalPages)}
                className="p-1 rounded-lg text-slate-500 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                title="最后一页"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Batch Open Modal */}
      {showBatchModal && (
        <BatchOpenModal
          isOpen={showBatchModal}
          onClose={() => setShowBatchModal(false)}
          collectionTitle={collection.title}
          items={collection.items}
        />
      )}
    </div>
  );
};
