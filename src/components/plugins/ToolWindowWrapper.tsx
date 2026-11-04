import React, { useState } from 'react';
import { X, Minus, Maximize2, Minimize2 } from 'lucide-react';

interface ToolWindowWrapperProps {
  title: string;
  icon?: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  defaultWidth?: string;
}

export const ToolWindowWrapper: React.FC<ToolWindowWrapperProps> = ({
  title,
  icon,
  isOpen,
  onClose,
  children,
  defaultWidth = 'max-w-xl',
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 pointer-events-none">
      {/* Dim backdrop (clickable to close or refocus) */}
      <div
        className="fixed inset-0 bg-black/25 backdrop-blur-xs pointer-events-auto transition-opacity"
        onClick={onClose}
      />

      {/* Window frame */}
      <div
        className={`pointer-events-auto liquid-glass rounded-2xl sm:rounded-3xl shadow-2xl border border-white/60 dark:border-white/15 overflow-hidden flex flex-col transition-all duration-200 z-10 ${
          isMaximized
            ? 'w-full h-[90vh]'
            : isMinimized
            ? 'w-72 h-14'
            : `w-full ${defaultWidth} max-h-[85vh]`
        }`}
      >
        {/* macOS Title Bar with Traffic Lights */}
        <div className="h-11 px-4 flex items-center justify-between border-b border-slate-200/50 dark:border-white/10 select-none bg-white/40 dark:bg-black/20 shrink-0">
          {/* Traffic lights */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="w-3 h-3 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center group text-[8px] text-rose-900 transition-colors"
              title="关闭 (Esc)"
            >
              <X size={8} className="opacity-0 group-hover:opacity-100" />
            </button>
            <button
              onClick={() => setIsMinimized(prev => !prev)}
              className="w-3 h-3 rounded-full bg-amber-400 hover:bg-amber-500 flex items-center justify-center group text-[8px] text-amber-900 transition-colors"
              title="最小化"
            >
              <Minus size={8} className="opacity-0 group-hover:opacity-100" />
            </button>
            <button
              onClick={() => setIsMaximized(prev => !prev)}
              className="w-3 h-3 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center group text-[8px] text-emerald-900 transition-colors"
              title="最大化"
            >
              {isMaximized ? (
                <Minimize2 size={8} className="opacity-0 group-hover:opacity-100" />
              ) : (
                <Maximize2 size={8} className="opacity-0 group-hover:opacity-100" />
              )}
            </button>
          </div>

          {/* Window Title */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            {icon && <span className="text-sky-500">{icon}</span>}
            <span>{title}</span>
          </div>

          <div className="w-12" />
        </div>

        {/* Window Content */}
        {!isMinimized && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
        )}
      </div>
    </div>
  );
};
