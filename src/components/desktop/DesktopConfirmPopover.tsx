import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { desktopDialogButton, useDesktopDialogAction } from './DesktopDialog';
import { positionDesktopMenu } from './desktop-layout';

export interface DesktopConfirmation {
  x: number;
  y: number;
  title: string;
  message: string;
  label: string;
  action(): void | Promise<void>;
}

export function DesktopConfirmPopover({ confirmation, language, onClose }: {
  confirmation: DesktopConfirmation; language?: string; onClose(): void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const { busy, error, run } = useDesktopDialogAction(language);
  const [position, setPosition] = useState({ left: 12, top: 12, maxHeight: 400 });
  useLayoutEffect(() => {
    const previous = document.activeElement;
    const element = panel.current!;
    const measure = () => setPosition(positionDesktopMenu({
      x: confirmation.x, y: confirmation.y + 6,
      width: element.offsetWidth, height: element.scrollHeight,
      viewportWidth: innerWidth, viewportHeight: innerHeight,
    }));
    measure();
    cancel.current?.focus({ preventScroll: true });
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [confirmation]);
  useLayoutEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!busy && !panel.current?.contains(event.target as Node)) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!busy) onClose();
      } else if (event.key === 'Tab') {
        const buttons = [...panel.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();
        buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [busy, onClose]);
  return createPortal(<div ref={panel} role="alertdialog" aria-modal="true" aria-label={confirmation.title}
    data-desktop-popup style={position}
    className="fixed z-[1700] w-80 max-w-[calc(100vw-24px)] overflow-y-auto rounded-lg border border-slate-300 bg-white p-3 text-slate-900 shadow-2xl dark:border-white/20 dark:bg-zinc-900 dark:text-slate-100">
    <div className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={16} className="shrink-0 text-rose-600 dark:text-rose-400" />{confirmation.title}</div>
    <p className="mt-2 break-words text-xs leading-relaxed text-slate-600 dark:text-slate-300">{confirmation.message}</p>
    {error && <p role="alert" className="mt-2 text-xs text-rose-600 dark:text-rose-300">{error}</p>}
    <div className="mt-3 flex justify-end gap-2">
      <button ref={cancel} type="button" className={desktopDialogButton} disabled={busy} onClick={onClose}>{language === 'en' ? 'Cancel' : '取消'}</button>
      <button type="button" className={`${desktopDialogButton} !text-rose-700 dark:!text-rose-300`} disabled={busy}
        onClick={() => { void run(async () => { await confirmation.action(); onClose(); }); }}>{confirmation.label}</button>
    </div>
  </div>, document.body);
}
