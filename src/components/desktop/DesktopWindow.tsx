import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  RotateCcw,
  ExternalLink,
  Lock,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { DesktopAppWindow } from '../../types';
import { FaviconImage } from '../common/FaviconImage';

interface DesktopWindowProps {
  windowData: DesktopAppWindow;
  isActive: boolean;
  isPushedAway?: boolean;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
  onMaximize: (id: string) => void;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onUpdateSize: (id: string, width: number, height: number) => void;
  onUpdateUrl: (id: string, newUrl: string) => void;
}

// Bottom clearance reserved for the iPadOS/macOS Dock so windows never overlap or slip below it
const DOCK_CLEARANCE = 86;

export const DesktopWindow: React.FC<DesktopWindowProps> = ({
  windowData,
  isActive,
  isPushedAway = false,
  onFocus,
  onClose,
  onMinimize,
  onMaximize,
  onUpdatePosition,
  onUpdateSize,
  onUpdateUrl,
}) => {
  const [inputUrl, setInputUrl] = useState(windowData.url);
  const [iframeKey, setIframeKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showSecurityTip, setShowSecurityTip] = useState(false);

  const dragStartRef = useRef<{ mouseX: number; mouseY: number; winX: number; winY: number } | null>(null);
  const resizeStartRef = useRef<{ mouseX: number; mouseY: number; winW: number; winH: number } | null>(null);

  // Sync address bar input when window URL changes externally
  useEffect(() => {
    setInputUrl(windowData.url);
    setIsLoading(true);
  }, [windowData.url]);

  // If minimized, do not render on screen
  if (windowData.isMinimized) {
    return null;
  }

  // Handle Dragging with strict boundary constraints (cannot exceed bottom dock)
  const handleDragStart = (e: React.MouseEvent) => {
    if (e.button !== 0 || windowData.isMaximized || isPushedAway) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, a')) return;

    onFocus(windowData.id);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      winX: windowData.x,
      winY: windowData.y,
    };
    setIsDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = moveEvent.clientX - dragStartRef.current.mouseX;
      const dy = moveEvent.clientY - dragStartRef.current.mouseY;

      // Horizontal bounds: keep at least 120px visible on screen
      const newX = Math.max(10, Math.min(window.innerWidth - 120, dragStartRef.current.winX + dx));

      // Vertical bounds: Top at 10px, bottom edge (winY + height) strictly cannot go below (innerHeight - DOCK_CLEARANCE)
      const maxAllowedY = Math.max(10, window.innerHeight - DOCK_CLEARANCE - windowData.height);
      const newY = Math.max(10, Math.min(maxAllowedY, dragStartRef.current.winY + dy));

      onUpdatePosition(windowData.id, newX, newY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Handle Corner Resizing with strict boundary constraints (cannot exceed bottom dock)
  const handleResizeStart = (e: React.MouseEvent) => {
    if (e.button !== 0 || windowData.isMaximized || isPushedAway) return;
    e.preventDefault();
    e.stopPropagation();

    onFocus(windowData.id);
    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      winW: windowData.width,
      winH: windowData.height,
    };
    setIsResizing(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizeStartRef.current) return;
      const dw = moveEvent.clientX - resizeStartRef.current.mouseX;
      const dh = moveEvent.clientY - resizeStartRef.current.mouseY;

      // Width bound
      const newW = Math.max(380, Math.min(window.innerWidth - windowData.x - 10, resizeStartRef.current.winW + dw));

      // Height bound: cannot extend below (innerHeight - DOCK_CLEARANCE)
      const maxAllowedH = Math.max(220, window.innerHeight - windowData.y - DOCK_CLEARANCE);
      const newH = Math.max(220, Math.min(maxAllowedH, resizeStartRef.current.winH + dh));

      onUpdateSize(windowData.id, newW, newH);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Handle Refresh
  const handleRefresh = () => {
    setIsRefreshing(true);
    setIsLoading(true);
    setIframeKey(prev => prev + 1);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  // Handle Address Bar Submit
  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let target = inputUrl.trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) {
      target = 'https://' + target;
    }
    setIsLoading(true);
    onUpdateUrl(windowData.id, target);
  };

  // macOS Sonoma Stage Manager / Reveal Desktop off-screen push transform calculation
  const screenCenterX = typeof window !== 'undefined' ? window.innerWidth / 2 : 700;
  const winCenterX = windowData.x + windowData.width / 2;
  const isLeftSide = winCenterX < screenCenterX;

  const pushStyleTransform = isPushedAway
    ? isLeftSide
      ? 'translateX(calc(-100vw - 120px)) scale(0.92)'
      : 'translateX(calc(100vw + 120px)) scale(0.92)'
    : 'translateX(0) scale(1)';

  return (
    <div
      onMouseDown={() => {
        if (!isPushedAway) onFocus(windowData.id);
      }}
      style={
        windowData.isMaximized
          ? {
              position: 'fixed',
              top: 12,
              left: 12,
              right: 12,
              bottom: DOCK_CLEARANCE, // strictly reserved above bottom dock
              zIndex: windowData.zIndex,
              transform: pushStyleTransform,
              opacity: isPushedAway ? 0.15 : 1,
              pointerEvents: isPushedAway ? 'none' : 'auto',
              transition:
                'transform 440ms cubic-bezier(0.16, 1, 0.3, 1), opacity 350ms ease, box-shadow 200ms',
            }
          : {
              position: 'fixed',
              top: windowData.y,
              left: windowData.x,
              width: windowData.width,
              height: windowData.height,
              zIndex: windowData.zIndex,
              transform: pushStyleTransform,
              opacity: isPushedAway ? 0.15 : 1,
              pointerEvents: isPushedAway ? 'none' : 'auto',
              transition:
                'transform 440ms cubic-bezier(0.16, 1, 0.3, 1), opacity 350ms ease, box-shadow 200ms',
            }
      }
      className={`desktop-window flex flex-col rounded-2xl overflow-hidden liquid-glass bg-white/95 dark:bg-[#12161f]/95 backdrop-blur-2xl select-none ${
        isActive
          ? 'ring-1 ring-sky-500/50 shadow-2xl border border-sky-400/40 dark:border-sky-400/30'
          : 'border border-slate-300/80 dark:border-white/10 shadow-xl opacity-98'
      }`}
    >
      {/* ======================================================== */}
      {/* Window Header Bar (Draggable Top Bar with Traffic Lights)  */}
      {/* ======================================================== */}
      <div
        onMouseDown={handleDragStart}
        className={`h-11 px-3.5 flex items-center justify-between border-b border-slate-200/80 dark:border-white/10 shrink-0 select-none transition-colors relative ${
          isActive
            ? 'bg-slate-100/90 dark:bg-white/[0.07]'
            : 'bg-slate-50/70 dark:bg-black/20'
        } ${windowData.isMaximized ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
      >
        {/* Loading Progress Bar */}
        {isLoading && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-sky-400 via-indigo-500 to-sky-400 animate-pulse z-40" />
        )}

        {/* Left: Website Favicon & Name */}
        <div className="flex items-center gap-2 min-w-0 max-w-[140px] sm:max-w-[200px]">
          <div className="w-5 h-5 rounded-md overflow-hidden flex items-center justify-center shrink-0 shadow-2xs">
            <FaviconImage
              url={windowData.url}
              title={windowData.title}
              iconBg={windowData.iconBg}
              size="sm"
              className="w-5 h-5"
            />
          </div>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
            {windowData.title}
          </span>
        </div>

        {/* Center: URL Address Bar and Action Buttons */}
        <div className="flex-1 max-w-xl mx-2 flex items-center gap-1.5">
          {/* Refresh Button */}
          <button
            type="button"
            onClick={handleRefresh}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title="刷新页面"
          >
            <RotateCcw
              size={13}
              className={`transition-transform ${isRefreshing ? 'animate-spin text-sky-500' : ''}`}
            />
          </button>

          {/* Address Bar Form */}
          <form onSubmit={handleUrlSubmit} className="flex-1 flex items-center">
            <div className="w-full flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/5 dark:bg-black/30 border border-slate-200/80 dark:border-white/10 text-xs focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-400/40 transition-all">
              <Lock size={11} className="text-emerald-500 shrink-0 opacity-80" />
              <input
                type="text"
                value={inputUrl}
                onChange={e => setInputUrl(e.target.value)}
                onMouseDown={e => e.stopPropagation()}
                placeholder="https://..."
                className="w-full bg-transparent border-0 focus:outline-none text-slate-800 dark:text-slate-200 text-xs truncate font-mono"
              />

              {/* Security Hint Toggle Button */}
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setShowSecurityTip(prev => !prev);
                }}
                className={`p-1 rounded-md transition-colors cursor-pointer shrink-0 ${
                  showSecurityTip
                    ? 'text-amber-500 bg-amber-500/10'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
                title="查看内嵌策略与兼容性提示"
              >
                <HelpCircle size={13} />
              </button>

              {/* Open in New Tab Button (Prompt user to open in new tab if security policy blocks iframe) */}
              <a
                href={windowData.url}
                target="_blank"
                rel="noreferrer"
                onMouseDown={e => e.stopPropagation()}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold text-white bg-sky-500 hover:bg-sky-600 shadow-2xs transition-all shrink-0"
                title="若目标网站限制内嵌显示空白，请在此一键于新标签页打开"
              >
                <span>新标签页打开</span>
                <ExternalLink size={10} />
              </a>
            </div>
          </form>
        </div>

        {/* Right: macOS-style Traffic Light Circular Buttons */}
        <div className="flex items-center gap-2 pl-2 shrink-0">
          {/* Minimize Button (Yellow) */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onMinimize(windowData.id);
            }}
            className="group w-3.5 h-3.5 rounded-full bg-amber-400 hover:bg-amber-500 border border-amber-500/40 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
            title="最小化到任务栏"
          >
            <Minus size={9} className="text-amber-950 opacity-0 group-hover:opacity-100 transition-opacity stroke-[3]" />
          </button>

          {/* Maximize / Restore Button (Green) */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onMaximize(windowData.id);
            }}
            className="group w-3.5 h-3.5 rounded-full bg-emerald-500 hover:bg-emerald-600 border border-emerald-600/40 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
            title={windowData.isMaximized ? '还原窗口大小' : '最大化窗口'}
          >
            {windowData.isMaximized ? (
              <Minimize2 size={8} className="text-emerald-950 opacity-0 group-hover:opacity-100 transition-opacity stroke-[3]" />
            ) : (
              <Maximize2 size={8} className="text-emerald-950 opacity-0 group-hover:opacity-100 transition-opacity stroke-[3]" />
            )}
          </button>

          {/* Close Button (Red) */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onClose(windowData.id);
            }}
            className="group w-3.5 h-3.5 rounded-full bg-rose-500 hover:bg-rose-600 border border-rose-600/40 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
            title="关闭桌面窗口"
          >
            <X size={9} className="text-rose-950 opacity-0 group-hover:opacity-100 transition-opacity stroke-[3]" />
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* Security / X-Frame-Options Notice Banner                 */}
      {/* ======================================================== */}
      {showSecurityTip && (
        <div className="px-3.5 py-2 bg-amber-500/10 dark:bg-amber-500/15 border-b border-amber-500/20 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2 shrink-0 animate-in fade-in duration-150">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle size={14} className="text-amber-500 shrink-0" />
            <span className="truncate">
              提示：若当前网站因跨域安全策略 (X-Frame-Options / CSP) 限制内嵌而显示空白，请点击右侧按钮在新标签页浏览。
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={windowData.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-[11px] shadow-2xs transition-colors"
            >
              <span>在新标签页打开</span>
              <ExternalLink size={11} />
            </a>
            <button
              type="button"
              onClick={() => setShowSecurityTip(false)}
              className="p-1 rounded-md text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* Window Body (Standard Direct Embed Iframe)               */}
      {/* ======================================================== */}
      <div className="relative flex-1 w-full bg-white dark:bg-slate-900 overflow-hidden">
        {/* Transparent overlay during drag/resize to prevent mouse events trapped by iframe */}
        {(isDragging || isResizing) && (
          <div className="absolute inset-0 z-30 bg-transparent pointer-events-auto" />
        )}

        <iframe
          key={iframeKey}
          src={windowData.url}
          title={windowData.title}
          onLoad={() => setIsLoading(false)}
          className="w-full h-full border-0 bg-white"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        />
      </div>

      {/* ======================================================== */}
      {/* Bottom-Right Corner Resize Handle                        */}
      {/* ======================================================== */}
      {!windowData.isMaximized && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-40 flex items-end justify-end p-0.5 text-slate-400 hover:text-sky-500 transition-colors"
          title="按住拖拽调整窗口大小"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M7 1L1 7M7 4L4 7M7 7L7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );
};
