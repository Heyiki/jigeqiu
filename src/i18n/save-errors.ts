import type { MessageTable } from './index';

export const saveErrorMessages = {
  libraryUncertain: {
    zh: '数据保存结果无法确认。请先刷新并检查收藏库，再决定后续操作；不要盲目重试或清空浏览器数据。',
    en: 'The data save result is uncertain. Refresh and check the library before making more changes. Do not retry blindly or clear browser data.',
  },
  libraryQuota: {
    zh: '浏览器存储空间不足，数据变更未保存。请释放空间后重试。',
    en: 'Browser storage is full. The data change was not saved. Free storage space before trying again.',
  },
  libraryUnavailable: {
    zh: '浏览器存储被阻止或不可用，数据变更未保存。请检查本站存储权限。',
    en: 'Browser storage is blocked or unavailable. The data change was not saved. Check site storage permissions.',
  },
  libraryConflict: {
    zh: '收藏库数据已在其他标签页变化，本次变更未保存。请保留未保存的输入，再刷新并检查最新收藏库数据。',
    en: 'Library data changed in another tab. This change was not saved. Keep any unsaved input, then refresh and check the latest library data.',
  },
  libraryLockUnavailable: {
    zh: '保存数据需要 HTTPS 或 localhost，以及支持 Web Locks 的浏览器。本次变更未保存，请保留输入并使用支持的浏览器。',
    en: 'Saving data requires HTTPS or localhost and a browser supporting Web Locks. This change was not saved. Keep your input and use a supported browser.',
  },
  libraryInvalidReference: {
    zh: '目标收藏或目录无效或已不存在，本次变更未保存。请保留输入，刷新并检查收藏库后重新选择有效目标。',
    en: 'The target bookmark or folder is invalid or no longer exists. This change was not saved. Keep your input, refresh and check the library, then select a valid target.',
  },
  librarySaveFailed: {
    zh: '收藏库数据保存失败，变更未应用。请保留输入，检查浏览器存储后重试。',
    en: 'Could not save library data. The change was not applied. Keep your input and check browser storage before trying again.',
  },
  settingsUncertain: {
    zh: '设置保存结果无法确认。请先刷新并检查已保存的设置，再决定后续操作；不要盲目重试或清空浏览器数据。',
    en: 'The settings save result is uncertain. Refresh and check the saved settings before making more changes. Do not retry blindly or clear browser data.',
  },
  settingsQuota: {
    zh: '浏览器存储空间不足，设置变更未保存。请释放空间后重试。',
    en: 'Browser storage is full. The settings change was not saved. Free storage space before trying again.',
  },
  settingsUnavailable: {
    zh: '浏览器存储被阻止或不可用，设置变更未保存。请检查本站存储权限。',
    en: 'Browser storage is blocked or unavailable. The settings change was not saved. Check site storage permissions.',
  },
  settingsConflict: {
    zh: '设置已在其他标签页变化，本次变更未保存。请刷新并检查最新设置。',
    en: 'Settings changed in another tab. This change was not saved. Refresh and check the latest settings.',
  },
  settingsSaveFailed: {
    zh: '设置保存失败，变更未应用。请检查浏览器存储后重试。',
    en: 'Could not save settings. The change was not applied. Check browser storage before trying again.',
  },
} as const satisfies MessageTable;
