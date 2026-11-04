import type { MessageTable } from './index';

export const guideMessages = {
  guideTitle: { zh: '使用指南', en: 'User guide' },
  guideSections: { zh: '指南小节', en: 'Guide sections' },
  guideGettingStarted: { zh: '快速上手', en: 'Getting started' },
  guideKeyboard: { zh: '快捷键', en: 'Keyboard shortcuts' },
  guideCommands: { zh: '快捷指令', en: 'Commands' },
  guideActions: { zh: '操作说明', en: 'Actions' },
  guideStartImport: {
    zh: '在管理中心「导入与导出」导入浏览器书签，或使用「添加收藏」保存网址。',
    en: 'Import browser bookmarks from Manage → Import & export, or add a bookmark directly.',
  },
  guideStartOrganize: {
    zh: '在「全部收藏」整理归档文件夹、名称和关键词。启动台显示全部收藏，与桌面固定项独立。',
    en: 'Organize folders, names and keywords in All bookmarks. Launchpad includes all bookmarks, not just desktop pins.',
  },
  guideStartPin: {
    zh: '将常用网址固定到桌面或任务栏；桌面文件夹仅整理快捷方式，不改变原收藏。',
    en: 'Pin frequent URLs to the desktop or Taskbar. Desktop folders organize shortcuts independently of library folders.',
  },
  guideStartSearch: {
    zh: '使用搜索查找收藏，或输入 / 选择快捷指令；完整清单见「快捷指令」。',
    en: 'Find bookmarks in search, or type / to choose a command. See Commands for the full list.',
  },
  guideStartBackup: {
    zh: '数据保存在当前浏览器，建议定期导出 JSON 备份；导出包含收藏和目录，不包含设置。',
    en: 'Data stays in this browser. Export JSON backups regularly; exports include bookmarks and folders, not preferences.',
  },
  guideKeyboardScope: {
    zh: '面板快捷键仅在桌面非编辑状态生效。输入、组词或其他弹窗中不抢占按键；系统或浏览器可能占用组合键，始终可使用按钮。',
    en: 'Panel shortcuts work on the desktop outside editing. Inputs, IME and dialogs keep their keys. System/browser shortcuts may take precedence; buttons remain available.',
  },
  guideSearchEntry: { zh: '打开指令搜索（桌面）', en: 'Open command search (desktop)' },
  guideDesktopPages: { zh: '桌面翻页', en: 'Desktop pages' },
  guideSearchSelection: { zh: '搜索选择结果', en: 'Search result selection' },
  guideLaunchpadSelection: { zh: '启动台选择图标', en: 'Launchpad selection' },
  guideControlNavigation: { zh: '下一个／上一个控件', en: 'Next / previous control' },
  guideSubmit: { zh: '执行结果／提交表单', en: 'Run result / submit form' },
  guideClose: { zh: '关闭最上层界面', en: 'Close topmost layer' },
  guideKeyboardDetails: {
    zh: '搜索输入时左右键移动光标；Tab 可进入结果和按钮。标题匹配忽略空格，唯一高度匹配时默认选中收藏，否则默认外搜。网址依次展示精确地址收藏、直接打开、同主机其他页面、子域名、弱相关结果、外搜与添加。网址匹配忽略协议、www和末尾斜线，保留路径、参数与锚点；默认选中第一条精确收藏，等价重复地址按原顺序选择，无精确命中则选中直接打开。Enter 执行当前选中项，手动选择优先。启动台有搜索词时 Enter 打开第一项。多行正文中 Enter 换行。',
    en: 'Left/right moves the text cursor in search. Tab reaches results and buttons. Title matching ignores spaces; a unique strong match selects a bookmark, otherwise web search is selected. URL results show exact saved URLs, direct-open, other same-host pages, subdomains, weak matches, web search and add bookmark. URL matching ignores protocol, www and a trailing slash, preserving paths, parameters and fragments. The first exact bookmark is selected, including equivalent duplicates in their original order; without an exact match, direct-open is selected. Enter runs the selection, with manual choices taking priority. A Launchpad query opens its first result. Enter adds a newline in multiline fields.',
  },
  guideCommandsIntro: {
    zh: '在桌面按 / 或 、 打开指令搜索，继续输入指令；使用方向键选择，按 Enter 执行，也可点击搜索结果。',
    en: 'Press / on the desktop to open command search, then keep typing. Select with the arrow keys and press Enter, or click a search result.',
  },
  guideSettingAlias: { zh: '同 /theme，保留的设置入口。', en: 'Same as /theme; the existing settings shortcut.' },
  guideCommandMatching: {
    zh: '支持指令前缀和大小写不敏感匹配。',
    en: 'Commands support prefix matching and are case-insensitive.',
  },
  guideCommandModes: {
    zh: '/dark、/light 是明确设定，重复执行不会反向切换。',
    en: '/dark and /light set a specific mode. Repeating either command does not toggle it.',
  },
  guideEngineSyntax: { zh: '/<引擎关键词> <搜索内容>', en: '/<engine keyword> <search query>' },
  guideCommandEngines: {
    zh: '搜索引擎指令格式：{syntax}。仅对本次搜索生效，不修改默认引擎。',
    en: 'Search engine command format: {syntax}. It applies only to the current search and does not change the default engine.',
  },
  guideActionAdd: {
    zh: '将网址保存到全部收藏，可设置名称、关键词与归档文件夹。',
    en: 'Save a URL with a name, keywords and library folder.',
  },
  guideActionPinDesktop: { zh: '创建桌面快捷方式，不复制原收藏。', en: 'Create a shortcut to the original bookmark.' },
  guideActionRemoveDesktop: {
    zh: '只移除桌面入口，原收藏和任务栏不变。',
    en: 'Remove only the desktop shortcut; keep the bookmark and Taskbar pin.',
  },
  guideActionUnpinDock: { zh: '只取消任务栏的固定入口，不删除收藏。', en: 'Remove the Taskbar pin without deleting the bookmark.' },
  guideActionMoveDesktop: {
    zh: '只整理快捷方式，不改变全部收藏中的归档位置。',
    en: 'Organize shortcuts without changing library folders.',
  },
  guideActionReveal: { zh: '跳转到原收藏所在的归档位置。', en: 'Navigate to the original bookmark in its library folder.' },
  guideActionDissolveDesktop: { zh: '移除分组，内部快捷方式回到桌面。', en: 'Remove the group and return its shortcuts to the desktop.' },
  guideActionRemoveFolder: {
    zh: '移除分组和内部快捷方式，原收藏保留。',
    en: 'Remove the group and its shortcuts, keeping the original bookmarks.',
  },
  guideActionDeleteBookmark: {
    zh: '收藏移至管理中心回收站，并清理桌面与任务栏引用。恢复不恢复桌面布局。',
    en: 'Move the bookmark to the recycle bin and remove desktop/Taskbar references. Restoring does not restore shortcuts.',
  },
} as const satisfies MessageTable;
