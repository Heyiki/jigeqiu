export const ACTION_TERMS = {
  add: ['添加收藏', 'Add bookmark'],
  pinDesktop: ['固定到桌面', 'Pin to desktop'],
  removeDesktop: ['从桌面移除', 'Remove from desktop'],
  pinDock: ['固定到任务栏', 'Pin to Taskbar'],
  unpinDock: ['从任务栏取消固定', 'Unpin from Taskbar'],
  moveDesktop: ['移至桌面文件夹…', 'Move to desktop folder…'],
  reveal: ['在全部收藏中定位', 'Reveal in all bookmarks'],
  dissolveDesktop: ['解散桌面文件夹', 'Dissolve desktop folder'],
  removeFolder: ['移除桌面文件夹及快捷方式…', 'Remove desktop folder and shortcuts…'],
  deleteBookmark: ['删除收藏…', 'Delete bookmark…'],
} as const;

export const actionTerm = (action: keyof typeof ACTION_TERMS, language?: string) =>
  ACTION_TERMS[action][language === 'en' ? 1 : 0];
