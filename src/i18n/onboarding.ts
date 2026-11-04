import type { MessageTable } from './index';

export const onboardingMessages = {
  onboardingWelcomeTitle: { zh: '欢迎使用记个球', en: 'Welcome to JIGEQIU' },
  onboardingWelcomeBody: {
    zh: '把网址收进收藏库，用桌面和搜索快速打开。收藏保存在当前浏览器，请定期备份。',
    en: 'Save URLs in your library and open them quickly from the desktop or search. Bookmarks stay in this browser; back them up regularly.',
  },
  onboardingStart: { zh: '开始了解', en: 'Start tour' },
  onboardingSkip: { zh: '暂时跳过', en: 'Skip for now' },
  onboardingNext: { zh: '下一步', en: 'Next' },
  onboardingPrev: { zh: '上一步', en: 'Previous' },
  onboardingDone: { zh: '完成', en: 'Done' },
  onboardingExit: { zh: '退出引导', en: 'Exit tour' },
  onboardingOpenSearch: { zh: '打开搜索', en: 'Open search' },
  onboardingSearchPlaceholder: { zh: '搜索收藏或输入网址', en: 'Search bookmarks or enter a URL' },
  onboardingProgress: { zh: '{{current}} / {{total}}', en: '{{current}} / {{total}}' },
  onboardingChooseTask: { zh: '想先做什么？', en: 'What would you like to do first?' },
  onboardingImportTask: { zh: '导入浏览器书签', en: 'Import browser bookmarks' },
  onboardingAddTask: { zh: '添加一个网址', en: 'Add a URL' },
  onboardingPinTask: { zh: '体验查找与固定', en: 'Find and pin a bookmark' },
  onboardingLater: { zh: '先自己看看', en: 'Explore on my own' },
  onboardingTourUnavailable: {
    zh: '暂时无法启动引导，你仍可正常使用；稍后可从使用指南重新开始。',
    en: 'The tour is unavailable right now. You can keep using the app and restart from the user guide later.',
  },
  onboardingProgressSaveFailed: {
    zh: '引导进度未能保存，下次可能再次出现。收藏数据不受影响。',
    en: 'Tour progress could not be saved and may appear again next time. Your bookmarks are unaffected.',
  },
  onboardingImportFile: {
    zh: '选择浏览器导出的书签HTML文件。普通网页不能直接读取浏览器书签。',
    en: 'Export a bookmark HTML file from your browser, then choose it here. This webpage cannot read browser bookmarks directly.',
  },
  onboardingImportPreview: {
    zh: '检查目录、网址数量和异常提示，确认后才会保存。',
    en: 'Review the import preview before saving. Imported bookmarks are not automatically pinned to the desktop.',
  },
  onboardingAddUrl: { zh: '填入你想收藏的网址。', en: 'Enter the URL you want to save.' },
  onboardingAddDetails: {
    zh: '确认名称和保存位置；关键词可选，用熟悉的叫法帮助以后找回。',
    en: 'Check the name and save location. Keywords are optional; use familiar terms to help find it later.',
  },
  onboardingPinSearch: {
    zh: '输入一个收藏名称，找到常用网址。',
    en: 'Search for a bookmark to pin by name, URL or keywords.',
  },
  onboardingPinChoose: { zh: '打开收藏的更多菜单，选择「固定到桌面」。', en: 'Open a bookmark’s actions menu and choose Pin to desktop.' },
  onboardingPinAction: {
    zh: '选择「固定到桌面」创建快捷方式，原收藏的保存位置不变。',
    en: 'Choose Pin to desktop to create a shortcut. The original bookmark stays in its library folder.',
  },
  onboardingViewShortcut: { zh: '查看桌面快捷方式', en: 'View desktop shortcut' },
  onboardingImportDone: {
    zh: '书签已导入，可在启动台或「全部收藏」中查看；不会自动固定到桌面或任务栏。',
    en: 'Bookmarks imported. Find them in Launchpad or All bookmarks. They are not automatically pinned to the desktop or Taskbar.',
  },
  onboardingAddDone: {
    zh: '网址已保存，可在启动台或「全部收藏」中找到，也可以继续固定到桌面。',
    en: 'URL saved. Find it in Launchpad or All bookmarks, or continue to pin it to the desktop.',
  },
  onboardingPinDone: {
    zh: '以后从这里快速打开。从桌面移除快捷方式，只移除入口，不会删除原收藏。',
    en: 'Desktop shortcut created. Removing the desktop shortcut does not delete the original bookmark.',
  },
  onboardingBackupTitle: { zh: '导出JSON资产备份', en: 'Export JSON asset backup' },
  onboardingBackupDescription: {
    zh: '数据只保存在当前浏览器，清除浏览器数据可能导致丢失。建议定期导出JSON资产备份，包含收藏和目录，不包含设置、桌面与任务栏布局、壁纸和回收站。',
    en: 'Data stays in this browser and may be lost if browser data is cleared. Export JSON asset backups regularly. Backups include bookmarks and folders, but not settings, desktop or Taskbar layouts, wallpapers or the recycle bin.',
  },
  onboardingGuideStart: { zh: '开始新手引导', en: 'Start onboarding' },
  onboardingGuideImport: { zh: '导入书签引导', en: 'Import bookmarks guide' },
  onboardingGuideAdd: { zh: '添加收藏引导', en: 'Add bookmark guide' },
  onboardingGuidePin: { zh: '查找与固定引导', en: 'Find and pin guide' },
  onboardingNoBookmarks: {
    zh: '还没有可固定的收藏，先导入书签或添加一个网址。',
    en: 'There are no bookmarks to pin yet. Import bookmarks or add a URL first.',
  },
  onboardingTourDesktopTitle: { zh: '常用网址放这里', en: 'Keep frequent sites here' },
  onboardingTourDesktopBody: {
    zh: '桌面只放你固定的快捷方式。暂时没有图标也没关系，收藏不必全部放到桌面。',
    en: 'The desktop holds only shortcuts you pin. An empty desktop is fine; not every bookmark needs a desktop icon.',
  },
  onboardingTourSearchTitle: { zh: '从这里找网址', en: 'Find sites here' },
  onboardingTourSearchBody: {
    zh: '搜索收藏名称、网址或关键词，也可以使用搜索引擎。执行前留意当前选中的结果。',
    en: 'Search bookmark names, URLs or keywords, or use a search engine. Check the selected result before running it.',
  },
  onboardingTourLaunchpadTitle: { zh: '全部收藏，随时打开', en: 'All bookmarks, ready to open' },
  onboardingTourLaunchpadBody: {
    zh: '启动台显示全部收藏，不限于已固定到桌面的项目。',
    en: 'Launchpad shows all bookmarks, not just those pinned to your desktop.',
  },
  onboardingTourLaunchpadFallback: {
    zh: '也可在搜索中输入 /start 打开启动台。',
    en: 'You can also enter /start in search to open Launchpad.',
  },
  onboardingTourManagementTitle: { zh: '整理与备份在这里', en: 'Organize and back up here' },
  onboardingTourManagementBody: {
    zh: '在管理中心整理全部收藏和目录、导入浏览器书签、导出JSON资产备份。',
    en: 'Organize all bookmarks and folders, import browser bookmarks and export JSON asset backups in Manage.',
  },
  onboardingTourGuideTitle: { zh: '随时回来查看', en: 'Come back any time' },
  onboardingTourGuideBody: {
    zh: '使用指南包含快捷键和操作说明，也可以从这里重新开始引导。',
    en: 'The user guide has keyboard shortcuts and action details. You can restart onboarding here too.',
  },
} as const satisfies MessageTable;
