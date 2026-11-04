import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type?: 'success' | 'error' | 'info';
  message: string;
  actionText?: string;
  onAction?: () => void;
  duration?: number;
}

interface ToastProps {
  toast: ToastMessage | null;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  // Automatically dismiss toast without lingering
  useEffect(() => {
    if (!toast) return;
    const duration = toast.duration || 3000;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [toast?.id, toast?.duration, onClose]);

  if (!toast) return null;

  return (
    <div className="fixed top-16 right-4 sm:right-6 z-[1300] max-w-[calc(100vw-2rem)] sm:max-w-md animate-in fade-in slide-in-from-top-3 duration-200 pointer-events-auto">
      <div className="liquid-glass flex items-center gap-3 px-4 py-2.5 rounded-2xl shadow-xl max-w-md border border-white/40 dark:border-white/10 text-slate-800 dark:text-slate-100">
        {toast.type === 'error' ? (
          <AlertCircle size={18} className="text-rose-500 shrink-0" />
        ) : toast.type === 'info' ? (
          <Info size={18} className="text-sky-500 shrink-0" />
        ) : (
          <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
        )}

        <span className="text-sm font-medium">{toast.message}</span>

        {toast.actionText && toast.onAction && (
          <button
            onClick={() => {
              toast.onAction?.();
              onClose();
            }}
            className="ml-2 text-xs font-semibold px-2.5 py-1 rounded-lg bg-sky-500 text-white hover:bg-sky-600 transition-colors shrink-0"
          >
            {toast.actionText}
          </button>
        )}

        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 -mr-1"
          aria-label="关闭提示"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
