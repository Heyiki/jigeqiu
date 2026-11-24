import React from 'react';
import { createRoot } from 'react-dom/client';
import { LinkHealthView } from '../../src/components/account/LinkHealthView';
import { LinkHealthController } from '../../src/services/link-health/controller';
import type { Bookmark } from '../../src/types';
import '../../src/index.css';

const count = Number(new URL(location.href).searchParams.get('count') ?? 10000);
const bookmarks: Bookmark[] = Array.from({ length: count }, (_, i) => ({
  id: String(i), title: `Capacity ${i}`, url: `https://capacity.test/${i}`, domain: 'capacity.test',
  category: 'uncategorized', pinnedToDesktop: false, order: i, collectionIds: [], createdAt: 1, updatedAt: 1,
}));
const controller = new LinkHealthController(async () => ({ category: 'missing', reason: 'http', status: 404 }));
const platform = {
  grants: async () => ['https://capacity.test/*'], contains: async () => true,
  request: async () => true, fetch: globalThis.fetch.bind(globalThis),
};
createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-5xl p-6">
  <LinkHealthView controller={controller} platform={platform} bookmarks={bookmarks} folders={[]} language="en" onTrash={async () => 0} />
</main>);
