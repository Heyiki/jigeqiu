type PageKey = Pick<KeyboardEvent, 'key' | 'defaultPrevented' | 'repeat' | 'isComposing' | 'keyCode'
  | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

export function desktopPageKeyStep(event: PageKey, blocked: boolean): number {
  if (blocked || event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229
    || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return 0;
  return event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
}
