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

export function createDoubleShiftTracker() {
  let downAt: number | null = null;
  let firstTapAt: number | null = null;
  const reset = () => { downAt = null; firstTapAt = null; };
  return {
    reset,
    handle(event: ShortcutEvent & { timeStamp: number }, type: 'keydown' | 'keyup', enabled = true) {
      if (!enabled || event.key !== 'Shift' || event.defaultPrevented || event.repeat
        || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey) {
        reset();
        return false;
      }
      const now = event.timeStamp;
      if (type === 'keydown') {
        if (downAt !== null) { reset(); return false; }
        if (firstTapAt !== null && now - firstTapAt > 400) firstTapAt = null;
        downAt = now;
        return false;
      }
      if (downAt === null || now - downAt > 300 || event.shiftKey) {
        reset();
        return false;
      }
      downAt = null;
      if (firstTapAt !== null && now - firstTapAt <= 400) {
        reset();
        return true;
      }
      firstTapAt = now;
      return false;
    },
  };
}
