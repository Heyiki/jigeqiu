import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FaviconImage } from '../../src/components/common/FaviconImage';
import { IconCacheSettings } from '../../src/components/common/IconCacheSettings';
import { CollectionsView } from '../../src/components/collections/CollectionsView';
import { CollectionDetailView } from '../../src/components/collections/CollectionDetailView';
import { FolderModal } from '../../src/components/desktop/FolderModal';
import { SpotlightSearch } from '../../src/components/desktop/SpotlightSearch';
import type { Bookmark, Collection, PlatformSite } from '../../src/types';
import { refreshSiteIcon } from '../../src/services/site-icons';
import '../../src/index.css';

const samples = [
  { id: 'square', title: 'Square', url: 'https://square.icons.test/private?token=secret' },
  { id: 'circle', title: 'Circle', url: 'https://circle.icons.test/' },
  { id: 'logo', title: 'Wide logo', url: 'https://logo.icons.test/' },
  { id: 'custom', title: 'Custom', url: 'https://custom.icons.test/', icon: 'https://cdn.icons.test/custom.png' },
  { id: 'han', title: '中文工具', url: 'https://missing.icons.test/' },
  { id: 'english', title: 'Unsplash', url: 'https://missing.icons.test/' },
  { id: 'digits', title: '360浏览器', url: 'https://missing.icons.test/' },
  { id: 'han-single', title: '中', url: 'https://missing.icons.test/' },
];
const custom: Bookmark = {
  id: 'custom-site', title: 'Custom site', url: 'https://square.icons.test/',
  domain: 'square.icons.test', icon: 'https://cdn.icons.test/custom.png', category: 'work',
  pinnedToDesktop: false, order: 0, collectionIds: [], createdAt: 1, updatedAt: 1,
};
const collection: Collection = {
  id: 'icons', title: 'Icon collection', description: '', category: 'work', authorId: 'local',
  authorName: 'Local', visibility: 'private', isPinnedToDesktop: false, createdAt: 1, updatedAt: 1,
  items: [{ bookmarkId: custom.id, title: custom.title, url: custom.url, domain: custom.domain, icon: custom.icon, order: 0 }],
};
const site: PlatformSite = {
  ...custom, tagline: '', description: '', recommendationReason: '', targetAudience: '',
  featured: false, relatedCollectionIds: [], viewCount: 0, favoriteCount: 0,
};
const noop = () => {};

function SurfaceFixture({ surface }: { surface: string }) {
  if (surface === 'collection') return <CollectionsView collections={[collection]} categories={[]} allBookmarks={[custom]}
    onSelectCollection={noop} onCreateCollection={noop} onCloneCollection={noop} onDeleteCollection={noop}
    onTogglePinCollection={noop} onShareCollection={noop} />;
  if (surface === 'detail') return <CollectionDetailView collection={collection} userBookmarks={[custom]}
    onBack={noop} onClone={noop} onShare={noop} onTogglePin={noop} onSaveBookmarkToMyLibrary={noop} />;
  if (surface === 'folder') return <FolderModal isOpen folder={{
    id: 'folder', name: 'Icon folder', bookmarkIds: [custom.id], pinnedToDesktop: false, order: 0, createdAt: 1, updatedAt: 1,
  }} allBookmarks={[custom]} onClose={noop} onOpenBookmark={noop} onRenameFolder={noop} onRemoveFromFolder={noop}
    onDeleteFolder={noop} onSaveFolderAsCollection={noop} onAddMoreBookmarks={noop} />;
  return <SpotlightSearch isOpen bookmarks={[]} folders={[]} collections={[]} platformSites={[site]} plugins={[]}
    searchEngines={[{ id: 'google', name: 'Google', keyword: 'g', urlTemplate: 'https://google.com/search?q={query}' }]}
    currentEngineId="google" onSelectEngine={noop} onOpenBookmark={noop} onOpenFolder={noop} onOpenCollection={noop}
    onOpenPlatformSite={noop} onOpenTool={noop} onQuickAdd={noop} />;
}

function Fixture() {
  const [mounted, setMounted] = useState(true);
  const [message, setMessage] = useState('');
  return <main className="min-h-screen bg-white p-6 text-slate-900 dark:bg-neutral-950 dark:text-white" style={{ letterSpacing: 0 }}>
    <header className="mb-7 flex flex-wrap items-center gap-3 border-b border-neutral-200 pb-4 dark:border-neutral-700">
      <h1 className="mr-auto text-xl font-semibold">网站图标</h1>
      <button onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount icons' : 'Mount icons'}</button>
      <button onClick={() => {
        const dark = document.documentElement.classList.toggle('dark');
        document.documentElement.classList.toggle('dark-glass', dark);
      }}>Theme</button>
      <button onClick={async () => {
        try { await refreshSiteIcon(samples[0]); setMessage('Refreshed'); }
        catch { setMessage('Refresh failed; previous icon kept'); }
      }}>Refresh square</button>
      <p role="status">{message}</p>
    </header>
    {mounted && <>
      <section aria-label="Artwork" className="mb-8 grid grid-cols-3 gap-x-5 gap-y-7 sm:grid-cols-4 lg:grid-cols-8">
        {samples.map(sample => <div key={sample.id} data-sample={sample.id} className="flex min-w-0 flex-col items-center gap-3">
          <FaviconImage {...sample} size="lg" iconBg="#ff00ff" />
          <span className="max-w-full break-words text-center text-xs">{sample.title}</span>
        </div>)}
      </section>
      <section aria-label="Fallback sizes" className="mb-8 space-y-6 border-t border-neutral-200 pt-6 dark:border-neutral-700">
        {['中文工具', '知乎', '百度', '掘金', '设计素材', '开发工具'].map((title, index) =>
          <div key={title} data-fallback-row={title} className="flex flex-wrap items-center gap-5">
            <span className="w-16 text-xs">{title}</span>
            {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map(size =>
              <div key={size} data-size={size} className="flex w-20 flex-col items-center gap-2">
                <FaviconImage title={title} url={`https://site-${index}.test/`} iconMode="text" size={size} />
                <span className="text-[10px] text-neutral-500">{size}</span>
              </div>)}
          </div>)}
      </section>
    </>}
    <section aria-label="Offscreen icon" className="mb-6 h-20 overflow-auto">
      <div className="flex h-[600px] items-end">
        <FaviconImage title="Deferred" url="https://deferred.icons.test/" size="sm" />
      </div>
    </section>
    <IconCacheSettings />
  </main>;
}

const surface = new URLSearchParams(location.search).get('surface');
createRoot(document.getElementById('icon-fixture')!).render(surface ? <SurfaceFixture surface={surface} /> : <Fixture />);
