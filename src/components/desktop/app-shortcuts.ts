export const SHORTCUTS = [
  { action: 'search', key: 'k', shift: false, keys: ['K'], zh: '打开搜索', en: 'Open search' },
  { action: 'launchpad', key: ' ', shift: true, keys: ['Shift', 'Space'], zh: '打开启动台', en: 'Open launchpad' },
  { action: 'add', key: 'Enter', shift: true, keys: ['Shift', 'Enter'], zh: '添加收藏', en: 'Add bookmark' },
] as const;

type ShortcutEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
  | 'repeat' | 'isComposing' | 'keyCode' | 'defaultPrevented'>;

export function appShortcut(event: ShortcutEvent) {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229
    || event.altKey || event.ctrlKey === event.metaKey) return null;
  return SHORTCUTS.find(shortcut => shortcut.key.toLowerCase() === event.key.toLowerCase()
    && shortcut.shift === event.shiftKey)?.action ?? null;
}

export const EDITABLE_SELECTOR = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"]';
