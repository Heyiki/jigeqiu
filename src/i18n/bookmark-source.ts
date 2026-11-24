import type { MessageTable } from './index';
export const bookmarkSourceMessages = {
  bookmarkSourceTitle: { zh: '收藏来源', en: 'Bookmark source' },
  bookmarkSourceExtension: { zh: '扩展收藏', en: 'Extension bookmarks' },
  bookmarkSourceBrowser: { zh: '浏览器书签', en: 'Browser bookmarks' },
  bookmarkSourceDescription: {
    zh: '切换只改变当前管理的来源，不合并、不搬运、不删除。两种来源分别保留桌面固定、Dock 和回收站记录。',
    en: 'Switching changes the active source without a merge, transfer or deletion. Desktop pins, Dock and recycle bin records are kept separately.',
  },
  bookmarkSourceBrowserDescription: {
    zh: '当前管理浏览器书签栏及其子目录。添加、编辑、移动和删除会直接修改浏览器书签；备注、图标和桌面固定保存在扩展中。可在下方选择收藏并固定到桌面。',
    en: 'You are managing the browser bookmark bar and its subfolders. Adding, editing, moving and deleting directly changes browser bookmarks. Notes, icons and desktop pins stay in the extension. Select bookmarks below to pin them to the desktop.',
  },
  bookmarkSourceConfirmBrowser: {
    zh: '切换到浏览器书签？', en: 'Switch to browser bookmarks?',
  },
  bookmarkSourcePermissionDisclosure: {
    zh: '需要你授权读取和修改浏览器书签。浏览器授权范围包含全部书签，本功能仅管理书签栏及其子目录；若有多个书签栏，优先使用账户书签栏。扩展原有收藏保持不变。切换成功后会重新加载页面，新增和右键收藏将保存到浏览器书签栏，删除也会删除对应的浏览器书签。',
    en: 'Allow the extension to read and change browser bookmarks. The browser permission covers all bookmarks; this feature manages only the bookmark bar and its subfolders, preferring the account bar when multiple bars exist. Existing extension bookmarks remain unchanged. The page reloads after switching. New bookmarks and right-click captures go to the browser bookmark bar; deleting an item also deletes its browser bookmark.',
  },
  bookmarkSourceConfirmExtension: { zh: '切换到扩展收藏？', en: 'Switch to extension bookmarks?' },
  bookmarkSourceExtensionDisclosure: {
    zh: '恢复扩展收藏及其桌面固定记录，停止管理浏览器书签。浏览器书签和附加信息保留，再次切换时读取浏览器最新内容。切换成功后会重新加载页面。',
    en: 'Restore extension bookmarks and their desktop pins, and stop managing browser bookmarks. Browser bookmarks and extra information are retained. Switching back reads the latest browser contents. The page reloads after switching.',
  },
  bookmarkSourceConfirm: { zh: '确认切换', en: 'Confirm switch' },
  bookmarkSourceCancel: { zh: '取消', en: 'Cancel' },
  bookmarkSourceBusy: { zh: '正在切换…', en: 'Switching…' },
  bookmarkSourcePermissionError: { zh: '未获得书签权限，收藏来源未切换。请重新授权或继续使用扩展收藏。', en: 'Bookmark permission was not granted. The source was not switched. Try again or continue using extension bookmarks.' },
  bookmarkSourceSaveTo: { zh: '保存位置：{source}', en: 'Save to: {source}' },
  bookmarkSourceProblemTitle: { zh: '收藏来源需要重新确认', en: 'Check the bookmark source' },
  bookmarkSourceChanged: { zh: '另一个窗口已切换收藏来源。请重新加载后继续，当前页面不能再保存到旧来源。', en: 'The bookmark source changed in another window. Reload to continue. This page can no longer save to the previous source.' },
  bookmarkSourcePermissionLost: { zh: '浏览器书签权限已失效。请重新授权，或切回扩展收藏。两边已有的收藏都保留。', en: 'Browser bookmark permission is no longer available. Grant it again or return to extension bookmarks. Both libraries are retained.' },
  bookmarkSourceUnavailable: { zh: '暂时无法读取浏览器书签栏。请重新加载重试，或切回扩展收藏；不会自动将收藏保存到其他来源。', en: 'The browser bookmark bar cannot be read. Reload to retry or return to extension bookmarks. Bookmarks will not be silently saved to another source.' },
  bookmarkSourceUncertain: { zh: '无法确认书签操作是否全部完成。请重新加载并核对浏览器书签，暂勿重复提交。', en: 'The bookmark operation may have partially completed. Reload and check the browser bookmarks before submitting again.' },
  bookmarkSourceReload: { zh: '重新加载', en: 'Reload' },
  bookmarkSourceGrant: { zh: '重新授权', en: 'Grant permission again' },
} as const satisfies MessageTable;
