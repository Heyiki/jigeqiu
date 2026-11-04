import type { MessageTable } from './index';

export const wallpaperMessages = {
  wallpaperChoose: { zh: '选择本地图片', en: 'Choose local image' },
  wallpaperSaving: { zh: '正在保存…', en: 'Saving…' },
  wallpaperFileHint: { zh: 'JPG、PNG、WebP，最大 10 MB、4000 万像素。仅保存于此浏览器，不上传，也不包含在收藏备份中。', en: 'JPG, PNG or WebP, up to 10 MB and 40 megapixels. Stored only in this browser; not uploaded or included in bookmark backups.' },
  wallpaperUseSaved: { zh: '使用已保存的图片', en: 'Use saved image' },
  wallpaperRemove: { zh: '移除自定义图片', en: 'Remove custom image' },
  wallpaperFailed: { zh: '图片未保存，请检查格式、大小或浏览器存储空间后重试。', en: 'Image was not saved. Check its format, size or available browser storage and retry.' },
} as const satisfies MessageTable;
