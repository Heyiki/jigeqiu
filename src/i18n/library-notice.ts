import type { MessageTable } from './index';

export const libraryNoticeMessages = {
  libraryNoticeLabel: { zh: '收藏库更新提示', en: 'Library update notice' },
  libraryNoticeMessage: { zh: '其他标签页已更新收藏库。重新载入前，本页不能保存收藏库变更，正在填写的表单仍保留。', en: 'Another tab changed your library. Library changes cannot be saved here until reload; open forms are kept.' },
  libraryNoticeReload: { zh: '重新载入', en: 'Reload' },
  libraryNoticeTitle: { zh: '重新载入最新收藏库？', en: 'Reload the latest library?' },
  libraryNoticeWarning: { zh: '重新载入会丢弃本页尚未保存的表单。请先在发生冲突的收藏表单中下载草稿，或复制输入内容。此操作不会合并或覆盖其他标签页的更新。', en: 'Unsaved forms will be lost when this page reloads. Download the draft from a conflicting bookmark form, or copy your input first. This does not merge or overwrite the other tab’s changes.' },
  libraryNoticeCancel: { zh: '取消', en: 'Cancel' },
  libraryNoticeConfirm: { zh: '确认重新载入', en: 'Confirm reload' },
} as const satisfies MessageTable;
