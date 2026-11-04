import type { MessageTable } from './index';

export const tipIds = [
  'tip01', 'tip02', 'tip03', 'tip04', 'tip05',
  'tip06', 'tip07', 'tip08', 'tip09', 'tip10',
  'tip11', 'tip12', 'tip13', 'tip14', 'tip15',
  'tip16', 'tip17', 'tip18', 'tip19', 'tip20',
  'tip21', 'tip22', 'tip23', 'tip24', 'tip25',
] as const;

export type TipId = typeof tipIds[number];

export const tipMessages = {
  tip01: {
    zh: '搜索收藏名称、网址或关键词',
    en: 'Search bookmarks by name, URL or keyword',
  },
  tip02: {
    zh: '桌面上直接按 /，打开指令搜索',
    en: 'Press / on the desktop to open command search',
  },
  tip03: {
    zh: '按 {mod}+K，快速打开搜索',
    en: 'Press {mod}+K to open search',
  },
  tip04: {
    zh: '粘贴网址，选择「添加收藏」即可保存',
    en: 'Paste a URL and choose Add bookmark to save it',
  },
  tip05: {
    zh: '点击左侧图标，切换搜索引擎',
    en: 'Click the icon on the left to switch search engines',
  },
  tip06: {
    zh: '输入 /，查看可用指令',
    en: 'Type / to see available commands',
  },
  tip07: {
    zh: '输入 /add，快速添加收藏',
    en: 'Type /add to add a bookmark',
  },
  tip08: {
    zh: '输入 /all，管理全部收藏',
    en: 'Type /all to manage all bookmarks',
  },
  tip09: {
    zh: '输入 /start，打开启动台',
    en: 'Type /start to open Launchpad',
  },
  tip10: {
    zh: '输入 /help，查看使用指南',
    en: 'Type /help to open the user guide',
  },
  tip11: {
    zh: '输入 /dark 或 /light，切换明暗模式',
    en: 'Type /dark or /light to set the appearance',
  },
  tip12: {
    zh: '按 {mod}+Shift+Enter，添加收藏',
    en: 'Press {mod}+Shift+Enter to add a bookmark',
  },
  tip13: {
    zh: '按 {mod}+Shift+Space，打开启动台',
    en: 'Press {mod}+Shift+Space to open Launchpad',
  },
  tip14: {
    zh: '在桌面空白处上滑，打开启动台',
    en: 'Swipe up on an empty desktop area to open Launchpad',
  },
  tip15: {
    zh: '在桌面空白处下滑，打开搜索',
    en: 'Swipe down on an empty desktop area to open search',
  },
  tip16: {
    zh: '在桌面空白处左右滑动，切换桌面页',
    en: 'Swipe left or right on an empty desktop area to change pages',
  },
  tip17: {
    zh: '启动台包含全部收藏，不只是桌面图标',
    en: 'Launchpad includes all bookmarks, not just desktop pins',
  },
  tip18: {
    zh: '将常用收藏固定到桌面或任务栏',
    en: 'Pin frequent bookmarks to the desktop or Taskbar',
  },
  tip19: {
    zh: '从桌面移除快捷方式，不会删除收藏',
    en: 'Removing a desktop shortcut keeps the bookmark',
  },
  tip20: {
    zh: '桌面文件夹只整理快捷方式，不改变收藏归档',
    en: 'Desktop folders organize shortcuts, not library folders',
  },
  tip21: {
    zh: '给收藏添加关键词，以后更容易找到',
    en: 'Add keywords to make bookmarks easier to find',
  },
  tip22: {
    zh: '在管理中心导入浏览器书签HTML文件',
    en: 'Import browser bookmark HTML files in Manage',
  },
  tip23: {
    zh: '导入的收藏不会自动固定到桌面',
    en: 'Imported bookmarks are not automatically pinned',
  },
  tip24: {
    zh: '收藏保存在当前浏览器，记得导出JSON资产备份',
    en: 'Bookmarks stay in this browser; export JSON asset backups',
  },
  tip25: {
    zh: '删除的收藏可在回收站恢复，桌面固定项需重新添加',
    en: 'Restore deleted bookmarks from the recycle bin, then pin them again',
  },
} as const satisfies MessageTable;
