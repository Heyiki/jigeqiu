import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { createTranslator } from '../../i18n';

const sizes = [15, 30, 50, 100];

export function PageSizeSelect({ value, disabled, language, onChange }: {
  value: number; disabled: boolean; language?: string; onChange(value: number): void;
}) {
  const t = createTranslator(language);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const [active, setActive] = useState(0);
  const open = position !== null && !disabled;

  function show(index = Math.max(0, sizes.indexOf(value))) {
    if (disabled || !trigger.current) return;
    const box = trigger.current.getBoundingClientRect();
    const width = Math.min(Math.max(box.width, 136), innerWidth - 16);
    const below = innerHeight - box.bottom;
    setActive(index);
    setPosition({
      top: below >= 144 || below >= box.top ? box.bottom + 6 : Math.max(8, box.top - 144),
      left: Math.max(8, Math.min(box.left, innerWidth - width - 8)), width,
    });
  }

  function choose(index: number) {
    onChange(sizes[index]);
    setPosition(null);
    trigger.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setPosition(null);
    const outside = (event: Event) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) close();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [open]);

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Tab') { setPosition(null); return; }
    if (event.key === 'Escape') {
      if (open) { event.preventDefault(); event.stopPropagation(); setPosition(null); }
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Enter' || event.key === ' ') {
      if (open) choose(active); else show();
      return;
    }
    const current = open ? active : Math.max(0, sizes.indexOf(value));
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? sizes.length - 1
      : Math.max(0, Math.min(sizes.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
    if (open) setActive(next); else show(next);
  }

  return <div className="flex items-center gap-1.5">
    <span id={`${id}-label`}>{t('managerPageSize')}</span>
    <button ref={trigger} type="button" role="combobox" aria-labelledby={`${id}-label`}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-menu` : undefined}
      aria-activedescendant={open ? `${id}-option-${active}` : undefined} disabled={disabled}
      onClick={() => open ? setPosition(null) : show()} onKeyDown={keyDown}
      className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900 shadow-sm outline-none transition-colors hover:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
      {t('managerPageSizeOption', { count: value })}
      <ChevronDown size={13} aria-hidden="true" className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && createPortal(<div ref={menu} id={`${id}-menu`} role="listbox" aria-labelledby={`${id}-label`}
      style={{ ...position, position: 'fixed', zIndex: 1200, maxHeight: 'calc(100dvh - 16px)' }}
      className="overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-600 dark:bg-slate-800">
      {sizes.map((size, index) => <button key={size} id={`${id}-option-${index}`} type="button" role="option"
        aria-selected={size === value} tabIndex={-1} onMouseDown={event => event.preventDefault()}
        onPointerMove={() => setActive(index)} onClick={() => choose(index)}
        className={`flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-xs font-medium ${index === active
          ? 'bg-sky-600 text-white' : 'text-slate-900 hover:bg-slate-100 dark:text-white dark:hover:bg-slate-700'}`}>
        {t('managerPageSizeOption', { count: size })}
        {size === value && <Check size={13} aria-hidden="true" className="shrink-0" />}
      </button>)}
    </div>, document.body)}
  </div>;
}
