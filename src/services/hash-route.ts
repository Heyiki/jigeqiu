import type { ManagementSection } from '../components/account/ManagementShell';

export type AppRoute = { page: 'desktop' } | { page: 'launchpad' } | { page: 'management'; section: ManagementSection };

const paths: Record<ManagementSection, string> = {
  bookmarks: '/library',
  engines: '/settings/search-engines',
  appearance: '/settings/appearance',
  'import-export': '/settings/import-export',
  trash: '/trash',
};

export function parseHashRoute(hash: string): AppRoute {
  if (hash === '#/start') return { page: 'launchpad' };
  const section = (Object.keys(paths) as ManagementSection[]).find(key => `#${paths[key]}` === hash);
  return section ? { page: 'management', section } : { page: 'desktop' };
}

export function hashForRoute(route: AppRoute): string {
  return `#${route.page === 'desktop' ? '/' : route.page === 'launchpad' ? '/start' : paths[route.section]}`;
}

export function routeTitle(route: AppRoute, language?: string): string {
  const en = language?.toLowerCase().startsWith('en');
  const titles: Record<ManagementSection, [string, string]> = {
    bookmarks: ['全部收藏', 'All Bookmarks'],
    engines: ['搜索引擎', 'Search Engines'],
    appearance: ['外观设置', 'Appearance'],
    'import-export': ['导入与导出', 'Import & Export'],
    trash: ['回收站', 'Trash'],
  };
  const title = route.page === 'desktop' ? (en ? 'Desktop' : '桌面')
    : route.page === 'launchpad' ? (en ? 'Launchpad' : '启动台') : titles[route.section][en ? 1 : 0];
  return `${title} · ${en ? 'JIGEQIU' : '记个球'}`;
}
