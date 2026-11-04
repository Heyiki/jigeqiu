import React, { useState } from 'react';
import {
  PlatformSite,
  DailyRecommendation,
  Collection,
  PublicUser,
  Category,
  Bookmark,
} from '../../types';
import { FaviconImage } from '../common/FaviconImage';
import {
  Compass,
  Sparkles,
  ExternalLink,
  Plus,
  Check,
  ChevronRight,
  Layers,
  Calendar,
  Send,
  User,
} from 'lucide-react';
import { SiteDetailModal } from './SiteDetailModal';
import { UserProfileModal } from './UserProfileModal';

interface ExploreViewProps {
  platformSites: PlatformSite[];
  dailyRecommendations: DailyRecommendation[];
  collections: Collection[];
  publicUsers: PublicUser[];
  categories: Category[];
  userBookmarks: Bookmark[];
  onAddToBookmark: (site: PlatformSite) => void;
  onSelectCollection: (col: Collection) => void;
  onOpenSubmissionForm: () => void;
}

export const ExploreView: React.FC<ExploreViewProps> = ({
  platformSites,
  dailyRecommendations,
  collections,
  publicUsers,
  categories,
  userBookmarks,
  onAddToBookmark,
  onSelectCollection,
  onOpenSubmissionForm,
}) => {
  const [activeTab, setActiveTab] = useState<'today' | 'sites' | 'collections' | 'users' | 'categories'>('today');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeSiteForModal, setActiveSiteForModal] = useState<PlatformSite | null>(null);
  const [activeUserForModal, setActiveUserForModal] = useState<PublicUser | null>(null);

  const todayPick = dailyRecommendations[0];
  const pastPicks = dailyRecommendations.slice(1);

  const isBookmarked = (url: string) => {
    return userBookmarks.some(
      b => b.url.toLowerCase() === url.toLowerCase()
    );
  };

  const filteredSites = platformSites.filter(site => {
    if (selectedCategory === 'all') return true;
    return site.category === selectedCategory;
  });

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-8 py-8 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-6 mb-8 border border-slate-300/90 dark:border-white/10 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center border border-teal-500/20 shadow-2xs">
            <Compass size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 dark:text-slate-100">
              探索与发现
            </h1>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium mt-1">
              发现全网有趣、有用、高审美的高质量网站、专题网址单与优质创作者
            </p>
          </div>
        </div>

        <button
          onClick={onOpenSubmissionForm}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white/90 dark:bg-white/10 hover:bg-sky-50 dark:hover:bg-white/20 text-xs font-bold text-slate-900 dark:text-slate-100 transition-colors border border-slate-300/90 dark:border-white/15 shadow-xs self-start sm:self-auto cursor-pointer"
        >
          <Send size={14} className="text-sky-600 dark:text-sky-400" />
          <span>向平台投稿网站或网址单</span>
        </button>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-1">
        <div className="flex items-center gap-1 p-1 rounded-2xl liquid-glass text-xs shrink-0">
          {[
            { id: 'today', label: '今日推荐' },
            { id: 'sites', label: '精选网站' },
            { id: 'collections', label: '社区网址单' },
            { id: 'users', label: '优质创作者' },
            { id: 'categories', label: '分类浏览' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white/80 dark:bg-white/20 text-sky-600 dark:text-sky-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab: Today */}
      {activeTab === 'today' && (
        <div className="space-y-8">
          {/* Today's Spotlight Hero */}
          {todayPick && (
            <div className="liquid-glass rounded-3xl p-6 sm:p-8 border border-white/60 dark:border-white/10 shadow-xl relative overflow-hidden">
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-600 dark:text-sky-400 mb-2">
                <Calendar size={14} />
                <span>{todayPick.date} · {todayPick.theme}</span>
              </div>

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 my-4">
                <div className="max-w-2xl">
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                    {todayPick.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {todayPick.summary}
                  </p>
                </div>

                {/* Direct Action for Today's pick */}
                <div className="flex items-center gap-3 shrink-0">
                  {todayPick.siteId && (() => {
                    const site = platformSites.find(s => s.id === todayPick.siteId);
                    if (!site) return null;
                    const bookmarked = isBookmarked(site.url);
                    return (
                      <>
                        <button
                          onClick={() => setActiveSiteForModal(site)}
                          className="px-4 py-2.5 rounded-xl liquid-glass text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                        >
                          查看详情背景
                        </button>
                        <button
                          onClick={() => onAddToBookmark(site)}
                          disabled={bookmarked}
                          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                            bookmarked
                              ? 'bg-emerald-500/15 text-emerald-600'
                              : 'bg-black/5 dark:bg-white/10 hover:bg-black/10'
                          }`}
                        >
                          {bookmarked ? <Check size={14} /> : <Plus size={14} />}
                          <span>{bookmarked ? '已在收藏中' : '加入收藏'}</span>
                        </button>
                        <a
                          href={site.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold transition-colors shadow-sm"
                        >
                          <ExternalLink size={14} />
                          <span>访问网站</span>
                        </a>
                      </>
                    );
                  })()}

                  {todayPick.collectionId && (() => {
                    const col = collections.find(c => c.id === todayPick.collectionId);
                    if (!col) return null;
                    return (
                      <button
                        onClick={() => onSelectCollection(col)}
                        className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold transition-colors shadow-sm"
                      >
                        <Layers size={14} />
                        <span>浏览专题网址单</span>
                      </button>
                    );
                  })()}
                </div>
              </div>

              {/* Editor's Note */}
              <div className="mt-4 pt-4 border-t border-slate-200/50 dark:border-white/10 text-xs text-slate-500 dark:text-slate-400 bg-black/5 dark:bg-white/5 p-4 rounded-2xl">
                <span className="font-semibold text-slate-700 dark:text-slate-200 block mb-1">
                  平台编辑寄语：
                </span>
                {todayPick.editorNote}
              </div>
            </div>
          )}

          {/* Past Recommendations History */}
          <div>
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 px-1">
              往期每日推荐精选
            </h3>
            <div className="space-y-3">
              {pastPicks.map(rec => {
                const site = rec.siteId ? platformSites.find(s => s.id === rec.siteId) : null;
                const col = rec.collectionId ? collections.find(c => c.id === rec.collectionId) : null;

                return (
                  <div
                    key={rec.id}
                    className="liquid-glass rounded-2xl p-4 border border-white/60 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-sky-500/30 transition-all"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-1">
                        <span>{rec.date}</span>
                        <span>·</span>
                        <span>{rec.theme}</span>
                      </div>
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {rec.title}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                        {rec.summary}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {site && (
                        <button
                          onClick={() => setActiveSiteForModal(site)}
                          className="px-3 py-1.5 rounded-xl liquid-glass text-xs font-medium hover:bg-black/5 text-slate-700 dark:text-slate-200 transition-colors"
                        >
                          详情
                        </button>
                      )}
                      {site && (
                        <a
                          href={site.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-300 hover:bg-sky-500/20 text-xs font-medium transition-colors"
                        >
                          <ExternalLink size={12} />
                          <span>访问</span>
                        </a>
                      )}
                      {col && (
                        <button
                          onClick={() => onSelectCollection(col)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-300 hover:bg-sky-500/20 text-xs font-medium transition-colors"
                        >
                          <Layers size={12} />
                          <span>查看网址单</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Sites */}
      {activeTab === 'sites' && (
        <div>
          {/* Category Filter Chips */}
          <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors shrink-0 ${
                selectedCategory === 'all'
                  ? 'bg-sky-500 text-white shadow-xs'
                  : 'liquid-glass text-slate-600 dark:text-slate-300 hover:bg-black/5'
              }`}
            >
              全部网站 ({platformSites.length})
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors shrink-0 ${
                  selectedCategory === cat.id
                    ? 'bg-sky-500 text-white shadow-xs'
                    : 'liquid-glass text-slate-600 dark:text-slate-300 hover:bg-black/5'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Grid of Site Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredSites.map(site => {
              const bookmarked = isBookmarked(site.url);
              return (
                <div
                  key={site.id}
                  className="liquid-glass rounded-3xl p-5 border border-white/60 dark:border-white/10 shadow-md flex flex-col justify-between group hover:border-sky-500/30 transition-all duration-200"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <FaviconImage
                          url={site.url}
                          title={site.title}
                          platformIcon={site.icon}
                          iconBg={site.iconBg}
                          size="md"
                        />
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                            {site.title}
                          </h3>
                          <span className="text-xs text-slate-400 font-mono truncate block">
                            {site.domain}
                          </span>
                        </div>
                      </div>

                      {site.featured && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                          精选
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed mb-3">
                      {site.tagline}
                    </p>

                    <div className="text-[11px] text-slate-400 line-clamp-2 bg-black/5 dark:bg-white/5 p-2 rounded-xl mb-4">
                      推荐理由：{site.recommendationReason}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-200/40 dark:border-white/10 text-xs">
                    <button
                      onClick={() => setActiveSiteForModal(site)}
                      className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                    >
                      详情
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onAddToBookmark(site)}
                        disabled={bookmarked}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-medium transition-colors ${
                          bookmarked
                            ? 'text-emerald-600 bg-emerald-500/10'
                            : 'liquid-glass text-slate-700 dark:text-slate-200 hover:bg-black/5'
                        }`}
                      >
                        {bookmarked ? <Check size={13} /> : <Plus size={13} />}
                        <span>{bookmarked ? '已收录' : '收藏'}</span>
                      </button>

                      <a
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-500 text-white hover:bg-sky-600 font-medium transition-colors shadow-2xs"
                      >
                        <ExternalLink size={13} />
                        <span>访问</span>
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Community Collections */}
      {activeTab === 'collections' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {collections.map(col => (
            <div
              key={col.id}
              onClick={() => onSelectCollection(col)}
              className="liquid-glass rounded-3xl overflow-hidden border border-white/60 dark:border-white/10 shadow-lg cursor-pointer group hover:border-sky-500/30 transition-all duration-200"
            >
              <div
                className={`h-28 bg-gradient-to-r ${col.coverGradient || 'from-sky-500 to-indigo-600'} p-4 flex flex-col justify-between text-white`}
              >
                <div className="text-[11px] opacity-80">
                  {col.items.length} 个精选网址
                </div>
                <h3 className="text-base font-bold truncate">{col.title}</h3>
              </div>
              <div className="p-4">
                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed mb-4">
                  {col.description}
                </p>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>创建者：{col.authorName}</span>
                  <span className="text-sky-500 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 font-medium">
                    <span>浏览</span>
                    <ChevronRight size={14} />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Creators */}
      {activeTab === 'users' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {publicUsers.map(user => (
            <div
              key={user.id}
              onClick={() => setActiveUserForModal(user)}
              className="liquid-glass rounded-3xl p-6 border border-white/60 dark:border-white/10 shadow-md flex flex-col justify-between cursor-pointer group hover:border-sky-500/30 transition-all"
            >
              <div>
                <div className="flex items-center gap-3.5 mb-3">
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-12 h-12 rounded-full object-cover border-2 border-white/80 shadow-sm"
                  />
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      {user.name}
                    </h3>
                    <span className="text-xs text-sky-500">
                      公开网址单 {user.createdCollectionIds.length} 组
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed">
                  {user.bio}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-200/40 dark:border-white/10 flex items-center justify-between text-xs text-slate-400">
                <span>点击查看创作者主页</span>
                <ChevronRight size={14} className="text-sky-500" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Categories */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {categories.map(cat => {
            const count = platformSites.filter(s => s.category === cat.id).length;
            return (
              <div
                key={cat.id}
                onClick={() => {
                  setSelectedCategory(cat.id);
                  setActiveTab('sites');
                }}
                className="liquid-glass rounded-2xl p-5 border border-white/60 dark:border-white/10 shadow-sm hover:border-sky-500/30 cursor-pointer transition-all group"
              >
                <div
                  className="w-10 h-10 rounded-xl mb-3 flex items-center justify-center text-white text-sm font-bold shadow-xs"
                  style={{ backgroundColor: cat.color }}
                >
                  {cat.name.charAt(0)}
                </div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-0.5">
                  {cat.name}
                </h4>
                <span className="text-xs text-slate-400">
                  {count} 个精选网站
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Site Detail Modal */}
      {activeSiteForModal && (
        <SiteDetailModal
          site={activeSiteForModal}
          isOpen={Boolean(activeSiteForModal)}
          onClose={() => setActiveSiteForModal(null)}
          collections={collections}
          isBookmarked={isBookmarked(activeSiteForModal.url)}
          onAddToBookmark={site => {
            onAddToBookmark(site);
          }}
          onSelectCollection={col => {
            setActiveSiteForModal(null);
            onSelectCollection(col);
          }}
        />
      )}

      {/* User Profile Modal */}
      {activeUserForModal && (
        <UserProfileModal
          user={activeUserForModal}
          isOpen={Boolean(activeUserForModal)}
          onClose={() => setActiveUserForModal(null)}
          collections={collections}
          onSelectCollection={col => {
            setActiveUserForModal(null);
            onSelectCollection(col);
          }}
        />
      )}
    </div>
  );
};
