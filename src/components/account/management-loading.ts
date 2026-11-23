import type { ManagementSection } from './ManagementShell';

export const loadManagement = () => import('./UserCenterView').then(module => ({ default: module.UserCenterView }));
export const loadTrash = () => import('./BookmarkTrashView').then(module => ({ default: module.BookmarkTrashView }));
export const loadLinkHealth = () => import('./LinkHealthView').then(module => ({ default: module.LinkHealthView }));
export const loadTransfer = () => import('./AssetTransferPage').then(module => ({ default: module.AssetTransferPage }));
export const loadWallpaperSettings = () => import('../common/WallpaperSettings').then(module => ({ default: module.WallpaperSettings }));

/** Warm only the destination's code; never mount a page or read its data. */
export function preloadManagementSection(section: ManagementSection) {
  return Promise.all([
    section === 'link-health' ? loadLinkHealth() : section === 'trash' ? loadTrash() : loadManagement(),
    section === 'import-export' ? loadTransfer() : section === 'appearance' ? loadWallpaperSettings() : undefined,
  ]).catch(() => { /* Navigation will surface an import failure if the page is requested. */ });
}
