import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './desktop-icons.css';

export function DesktopIconLabel({ name, disabled = false }: { name: string; disabled?: boolean }) {
  const label = useRef<HTMLSpanElement>(null);
  const id = useId();
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);
  useEffect(() => {
    setAnchor(null);
    const element = label.current;
    const item = element?.closest<HTMLElement>('button, [role="button"]');
    if (!element || !item || disabled) return;
    const show = () => {
      if (element.scrollWidth <= element.clientWidth) return;
      const rect = element.getBoundingClientRect();
      setAnchor({ left: rect.left, top: rect.top, width: Math.max(rect.width, window.innerWidth - rect.left - 12) });
    };
    const hide = () => setAnchor(null);
    const pointer = (event: PointerEvent) => { if (event.pointerType !== 'touch') show(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
    item.addEventListener('pointerenter', pointer);
    item.addEventListener('pointerleave', hide);
    item.addEventListener('focus', show);
    item.addEventListener('blur', hide);
    item.addEventListener('contextmenu', hide);
    item.addEventListener('dragstart', hide);
    item.addEventListener('click', hide);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      item.removeEventListener('pointerenter', pointer);
      item.removeEventListener('pointerleave', hide);
      item.removeEventListener('focus', show);
      item.removeEventListener('blur', hide);
      item.removeEventListener('contextmenu', hide);
      item.removeEventListener('dragstart', hide);
      item.removeEventListener('click', hide);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, [name, disabled]);
  const expanded = !disabled && anchor !== null;
  return <>
    <span className="desktop-icon-label-slot">
      <span ref={label} data-desktop-label="" className="desktop-icon-label"
        aria-describedby={expanded ? id : undefined} style={{ visibility: expanded ? 'hidden' : undefined }}>{name}</span>
    </span>
    {expanded && createPortal(
      <span id={id} role="tooltip" aria-label={name} className="desktop-icon-label-tip"
        style={{ left: anchor.left, top: anchor.top, maxWidth: anchor.width }}>{name}</span>,
      document.body,
    )}
  </>;
}
