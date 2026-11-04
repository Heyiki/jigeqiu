import React, { useState } from 'react';
import { PlatformSite, Collection } from '../../types';
import { Modal } from '../common/Modal';
import { FaviconImage } from '../common/FaviconImage';
import {
  ExternalLink,
  Plus,
  Check,
  Share2,
  AlertCircle,
  Layers,
  Sparkles,
} from 'lucide-react';

interface SiteDetailModalProps {
  site: PlatformSite | null;
  isOpen: boolean;
  onClose: () => void;
  collections: Collection[];
  isBookmarked: boolean;
  onAddToBookmark: (site: PlatformSite) => void;
  onSelectCollection: (col: Collection) => void;
}

export const SiteDetailModal: React.FC<SiteDetailModalProps> = ({
  site,
  isOpen,
  onClose,
  collections,
  isBookmarked,
  onAddToBookmark,
  onSelectCollection,
}) => {
  const [reported, setReported] = useState(false);

  if (!site) return null;

  const relatedCols = collections.filter(c =>
    site.relatedCollectionIds.includes(c.id)
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="xl"
      title="网站详情与推荐背景"
    >
      <div className="space-y-5 pt-1">
        {/* Header Profile */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <FaviconImage
              url={site.url}
              title={site.title}
              platformIcon={site.icon}
              iconBg={site.iconBg}
              size="lg"
            />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {site.title}
                </h3>
                {site.featured && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    精选收录
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {site.domain}
              </span>
            </div>
          </div>

          {/* Primary Action is Visit Site */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onAddToBookmark(site)}
              disabled={isBookmarked}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                isBookmarked
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'liquid-glass hover:bg-black/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 border border-black/5 dark:border-white/10'
              }`}
            >
              {isBookmarked ? (
                <>
                  <Check size={14} />
                  <span>已在收藏中</span>
                </>
              ) : (
                <>
                  <Plus size={14} />
                  <span>收藏网站</span>
                </>
              )}
            </button>

            <a
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium transition-colors shadow-sm"
            >
              <ExternalLink size={14} />
              <span>直接访问</span>
            </a>
          </div>
        </div>

        {/* Tagline */}
        <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-slate-200/40 dark:border-white/5 text-xs text-slate-700 dark:text-slate-200 font-medium">
          {site.tagline}
        </div>

        {/* Detailed Intro & Scenarios */}
        <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
          <div>
            <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">
              平台收录说明
            </h4>
            <p className="leading-relaxed">{site.description}</p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-1.5">
              <Sparkles size={13} className="text-amber-500" />
              <span>编辑推荐理由</span>
            </h4>
            <p className="leading-relaxed text-slate-700 dark:text-slate-200 bg-amber-500/5 dark:bg-amber-500/10 p-3 rounded-2xl border border-amber-500/10">
              {site.recommendationReason}
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">
              适用人群与场景
            </h4>
            <p className="leading-relaxed">{site.targetAudience}</p>
          </div>
        </div>

        {/* Related Collections */}
        {relatedCols.length > 0 && (
          <div className="pt-2">
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-1.5">
              <Layers size={13} className="text-indigo-500" />
              <span>相关收录网址单</span>
            </h4>
            <div className="flex flex-wrap gap-2">
              {relatedCols.map(col => (
                <button
                  key={col.id}
                  onClick={() => {
                    onClose();
                    onSelectCollection(col);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl liquid-glass hover:bg-black/5 dark:hover:bg-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors border border-black/5 dark:border-white/10"
                >
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span>{col.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer: Report issue */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200/50 dark:border-white/10 text-xs text-slate-400">
          <span>发现信息失效或变更？</span>
          {reported ? (
            <span className="text-emerald-500 flex items-center gap-1">
              <Check size={12} />
              <span>感谢反馈，运营团队将尽快核实</span>
            </span>
          ) : (
            <button
              onClick={() => setReported(true)}
              className="hover:text-rose-500 transition-colors flex items-center gap-1"
            >
              <AlertCircle size={12} />
              <span>报告资料失效或错误</span>
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
