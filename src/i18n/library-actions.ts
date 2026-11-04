import type { MessageTable } from './index';

export const libraryActionMessages = {
  removeLibraryFolder: { zh: '移除收藏库文件夹', en: 'Remove library folder' },
  libraryFolderCounts: { zh: '{folders} 个文件夹 · {bookmarks} 个收藏', en: '{folders} folders · {bookmarks} bookmarks' },
  removeLibraryFolderExplanation: {
    zh: '解散仅移除当前文件夹，直接子项移至上一级，子目录内部结构不变。连同内容删除会将整棵目录移至回收站，可整体恢复，并移除相关桌面与任务栏快捷方式。',
    en: 'Dissolve lifts immediate contents to the parent and keeps nested folders intact. Deleting moves the entire subtree to the recycle bin as one recoverable batch and removes its desktop/Taskbar shortcuts.',
  },
  dissolveKeepContents: { zh: '解散并保留内容', en: 'Dissolve; keep contents' },
  deleteFolderContents: { zh: '连同内容删除', en: 'Delete folder and contents' },
  folderDissolved: { zh: '文件夹已解散，内容保留', en: 'Folder dissolved; contents kept' },
  folderMovedToTrash: { zh: '文件夹及内容已移至回收站', en: 'Folder and contents moved to the recycle bin' },
  bookmarkUpdated: { zh: '收藏已更新', en: 'Bookmark updated' },
  bookmarkAdded: { zh: '已添加收藏', en: 'Bookmark added' },
  bookmarkAddedAndPinned: { zh: '已添加收藏并发送快捷方式到桌面', en: 'Bookmark added and pinned to desktop' },
} as const satisfies MessageTable;
