import type { MessageTable } from './index';

export const iconSettingsMessages = {
  iconSettingsTitle: { zh: '网站图标', en: 'Website icons' },
  iconSettingsAllow: { zh: '允许 Google 图标服务', en: 'Allow Google favicon service' },
  iconSettingsPrivacy: { zh: '开启后，缺失图标的网站域名会发送给 Google；不包含页面路径或搜索词。', en: 'When enabled, domains with missing icons are sent to Google, without page paths or search terms.' },
  iconSettingsSaveFailed: { zh: '无法保存图标偏好，请检查浏览器存储权限', en: 'Could not save icon preferences. Check browser storage permissions.' },
  iconSettingsCleared: { zh: '图标缓存已清除，收藏数据未改变', en: 'Icon cache cleared. Bookmarks unchanged.' },
  iconSettingsClearFailed: { zh: '图标缓存未能完全清除，收藏数据未改变', en: 'Could not fully clear the icon cache. Bookmarks unchanged.' },
  iconSettingsClear: { zh: '清除图标缓存', en: 'Clear icon cache' },
} as const satisfies MessageTable;
