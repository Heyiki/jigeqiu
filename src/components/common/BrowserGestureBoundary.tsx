import { useEffect } from 'react';

// Preserve horizontal scrolling inside controls, but never chain it into browser navigation.
export function BrowserGestureBoundary() {
  useEffect(() => {
    const wheel = (event: WheelEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey
        || Math.abs(event.deltaX) <= Math.abs(event.deltaY) || !event.cancelable) return;
      let element = event.target instanceof Element ? event.target : null;
      while (element && element !== document.documentElement) {
        const style = getComputedStyle(element);
        if (/(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1) {
          const position = element.scrollLeft;
          if ((event.deltaX < 0 && position > 1)
            || (event.deltaX > 0 && position < element.scrollWidth - element.clientWidth - 1)) return;
        }
        element = element.parentElement;
      }
      event.preventDefault();
    };
    window.addEventListener('wheel', wheel, { passive: false });
    return () => window.removeEventListener('wheel', wheel);
  }, []);
  return null;
}
