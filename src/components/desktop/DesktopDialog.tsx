import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { preferenceSaveError } from '../../services/preference-save-error';

export const desktopDialogButton = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-slate-300/70 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10';
export const desktopDialogInput = 'min-h-9 min-w-0 rounded-md border border-slate-300/80 bg-white/70 px-2.5 py-1.5 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:border-white/20 dark:bg-black/20 dark:text-slate-100';

function actionError(cause: unknown, language?: string): string {
  const en = language === 'en';
  const code = typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string'
    ? cause.code : cause instanceof Error ? cause.message : '';
  const name = cause instanceof Error ? cause.name : '';
  if (['COMMIT_UNCERTAIN', 'CONFLICT', 'QUOTA_EXCEEDED', 'SecurityError',
    'STORAGE_UNAVAILABLE', 'LOCK_UNAVAILABLE', 'INVALID_REFERENCE'].includes(code)
    || name === 'QuotaExceededError' || name === 'SecurityError') {
    return preferenceSaveError(cause, language, 'library');
  }
  if (code === 'PREVIEW_STALE') {
    return en ? 'Local data changed. Keep your input and refresh before retrying.'
      : '本机数据已变化，请保留输入并刷新后重试。';
  }
  return en ? 'The operation failed. Your input is kept; check local data and retry.'
    : '操作失败，输入已保留。请检查本机数据后重试。';
}

export function useDesktopDialogAction(language?: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  async function run(action: () => void | Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      if (mounted.current) setError(actionError(cause, language));
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { busy, error, run };
}

interface DesktopDialogProps {
  label: string;
  title: string;
  language?: string;
  busy: boolean;
  error: string;
  onClose(): void;
  children: ReactNode;
  suspended?: boolean;
  compact?: boolean;
}

export function DesktopDialog({ label, title, language, busy, error, onClose, children, suspended = false, compact = false }: DesktopDialogProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const [bottomInset, setBottomInset] = useState(12);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (suspended) return;
    const previous = document.activeElement;
    const element = dialog.current;
    if (!element) return;
    const focusables = () => Array.from(element.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
    )).filter(item => item.getClientRects().length > 0 && !item.closest('[inert]'));
    (element.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? element).focus();
    const isTopmost = () => {
      if (document.querySelector('[data-desktop-popup], [data-folder-dragging]')) return false;
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]:not([aria-hidden="true"]), [role="alertdialog"], dialog[open]');
      return dialogs[dialogs.length - 1] === element;
    };
    const key = (event: KeyboardEvent) => {
      if (!isTopmost()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === items.length - 1)) {
        event.preventDefault();
        ((event.shiftKey ? items[items.length - 1] : items[0]) ?? element).focus();
      }
    };
    const focus = (event: FocusEvent) => {
      if (isTopmost() && !element.contains(event.target as Node)) (focusables()[0] ?? element).focus();
    };
    document.addEventListener('keydown', key, true);
    document.addEventListener('focusin', focus);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('focusin', focus);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [suspended]);
  useEffect(() => {
    const dock = document.querySelector('[data-testid="bottom-dock"], .dock-container');
    const measure = () => {
      const rect = dock?.getBoundingClientRect();
      setBottomInset(rect && rect.width > 0 && rect.height > 0
        ? Math.max(12, window.innerHeight - rect.top + 12) : 12);
    };
    const observer = new ResizeObserver(measure);
    if (dock) observer.observe(dock);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, []);
  return <div className={`desktop-dialog-backdrop fixed inset-0 z-[1300] flex items-center justify-center px-3 ${suspended ? 'pointer-events-none opacity-0' : ''}`}
    aria-hidden={suspended || undefined} inert={suspended || undefined}
    style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: `max(${bottomInset}px, env(safe-area-inset-bottom))` }}
    onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={dialog} role="dialog" aria-modal={!suspended || undefined} aria-hidden={suspended || undefined} aria-label={label} aria-busy={busy} tabIndex={-1}
      className={`desktop-dialog-surface liquid-glass flex max-h-full w-full ${compact ? 'max-w-sm' : 'max-w-2xl'} min-w-0 flex-col overflow-hidden rounded-lg outline-none`}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-black/10 px-4 py-3 dark:border-white/10">
        <h2 className="min-w-0 break-words text-sm font-semibold">{title}</h2>
        <button type="button" disabled={busy} onClick={onClose}
          aria-label={language === 'en' ? 'Close' : '关闭'} title={language === 'en' ? 'Close' : '关闭'}
          className={`${desktopDialogButton} h-9 w-9 shrink-0 !px-0`}><X size={16} /></button>
      </header>
      {error && <p role="alert" className="shrink-0 break-words border-b border-rose-600/15 px-4 py-2 text-xs text-rose-700 dark:text-rose-300">{error}</p>}
      <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
    </div>
  </div>;
}
