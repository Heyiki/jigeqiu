import React, { useState } from 'react';
import { CollectionItem } from '../../types';
import { Modal } from '../common/Modal';
import { FaviconImage } from '../common/FaviconImage';
import { ExternalLink, AlertTriangle, CheckSquare, Square } from 'lucide-react';

interface BatchOpenModalProps {
  isOpen: boolean;
  onClose: () => void;
  collectionTitle: string;
  items: CollectionItem[];
  language?: string;
}

export const BatchOpenModal: React.FC<BatchOpenModalProps> = ({
  isOpen,
  onClose,
  collectionTitle,
  items,
  language = 'zh',
}) => {
  const en = language.startsWith('en');
  const text = (zh: string, english: string) => en ? english : zh;
  const [selectedUrls, setSelectedUrls] = useState<string[]>(
    items.map(item => item.url)
  );
  const [openedCount, setOpenedCount] = useState(0);

  const toggleSelect = (url: string) => {
    setSelectedUrls(prev =>
      prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
    );
  };

  const toggleSelectAll = () => {
    if (selectedUrls.length === items.length) {
      setSelectedUrls([]);
    } else {
      setSelectedUrls(items.map(i => i.url));
    }
  };

  const handleOpenAll = () => {
    const urlsToOpen = items.filter(i => selectedUrls.includes(i.url));
    let requested = 0;
    urlsToOpen.forEach(item => {
      try {
        const url = new URL(item.url);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
        window.open(item.url, '_blank', 'noopener,noreferrer');
        requested++;
      } catch { /* A blocked request must not prevent the remaining fallback links. */ }
    });
    setOpenedCount(requested);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      contained
      title={text(`批量打开「${collectionTitle}」`, `Open collection: ${collectionTitle}`)}
    >
      <div className="space-y-4 pt-1">
        {/* Browser Popup Warning */}
        <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs">
          <AlertTriangle size={16} className="shrink-0 text-amber-500 mt-0.5" />
          <div className="leading-relaxed">
            {text('浏览器可能拦截部分窗口；请允许本站弹窗，或使用下方的逐条打开按钮。', 'Your browser may block some tabs. Allow popups or open the links individually below.')}
          </div>
        </div>

        {/* Header with select all */}
        <div className="flex items-center justify-between text-xs px-1">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-sky-500 transition-colors font-medium"
          >
            {selectedUrls.length === items.length ? (
              <CheckSquare size={14} className="text-sky-500" />
            ) : (
              <Square size={14} className="text-slate-400" />
            )}
            <span>{text('全选 / 反选', 'Select / deselect all')} ({selectedUrls.length}/{items.length})</span>
          </button>
          <span className="text-slate-400">{text('可逐条打开', 'Individual links available')}</span>
        </div>

        {/* Checklist of Items */}
        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-white/5 border border-slate-200/50 dark:border-white/10 rounded-2xl p-1">
          {items.map((item, index) => {
            const isChecked = selectedUrls.includes(item.url);
            return (
              <div
                key={`${index}:${item.url}`}
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer group"
                onClick={() => toggleSelect(item.url)}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="text-sky-500 shrink-0">
                    {isChecked ? <CheckSquare size={15} /> : <Square size={15} className="text-slate-400" />}
                  </div>
                  <FaviconImage url={item.url} title={item.title} icon={item.icon} iconMode={item.iconMode} size="sm" />
                  <div className="truncate">
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200 block truncate">
                      {item.title}
                    </span>
                    <span className="text-[11px] text-slate-400 truncate block">
                      {item.domain}
                    </span>
                  </div>
                </div>

                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="p-1 text-slate-500 hover:text-sky-500 transition-opacity"
                  title={text('单独打开', 'Open link')}
                  aria-label={text(`打开 ${item.title}`, `Open ${item.title}`)}
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200/50 dark:border-white/10 text-xs">
          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-slate-500 hover:bg-black/5 transition-colors"
          >
            {text('关闭', 'Close')}
          </button>
          <button
            onClick={handleOpenAll}
            disabled={selectedUrls.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white font-medium transition-colors shadow-sm"
          >
            <ExternalLink size={13} />
            <span>
              {openedCount > 0
                ? text(`已发起 ${openedCount} 个打开请求，可再次尝试`, `${openedCount} tabs requested; try again`)
                : text(`确认打开选中的 ${selectedUrls.length} 个网址`, `Open ${selectedUrls.length} selected links`)}
            </span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
