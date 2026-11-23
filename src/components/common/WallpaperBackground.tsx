import React, { useEffect, useLayoutEffect, useState } from 'react';
import { readWallpaper, subscribeWallpaperChange, visibleWallpaper } from '../../services/custom-wallpaper';
import { WallpaperPreset, AppearanceMode, GradientBackground } from '../../types';
import { gradientImage, normalizeGradient } from '../../services/gradient-background';
import './wallpaper.css';

interface WallpaperBackgroundProps {
  preset: WallpaperPreset;
  appearance: AppearanceMode;
  customWallpaperId?: string;
  backgroundType?: 'wallpaper' | 'gradient';
  gradientBackground?: GradientBackground;
  children: React.ReactNode;
}

export const WallpaperBackground: React.FC<WallpaperBackgroundProps> = ({
  preset,
  appearance,
  children,
  customWallpaperId,
  backgroundType,
  gradientBackground,
}) => {
  const isGradient = backgroundType === 'gradient';
  const [custom, setCustom] = useState<{ id: string; url: string } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribeWallpaperChange(() => setRevision(value => value + 1)), []);
  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    if (!isGradient && preset === 'custom' && customWallpaperId) {
      void readWallpaper(customWallpaperId).then(blob => {
        if (cancelled) return;
        if (!blob) { setCustom(null); return; }
        url = URL.createObjectURL(blob);
        setCustom({ id: customWallpaperId, url });
      }).catch(() => { if (!cancelled) setCustom(null); });
    }
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [preset, customWallpaperId, revision, isGradient]);
  const customUrl = !isGradient && preset === 'custom' && custom && custom.id === customWallpaperId ? custom.url : undefined;
  const isDark = appearance === 'dark-glass';
  const isReduced = appearance === 'reduced-transparency';

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.classList.toggle('dark-glass', isDark);
    root.classList.toggle('reduced-transparency', isReduced);
  }, [isDark, isReduced]);

  return (
    <div data-wallpaper={isGradient ? undefined : visibleWallpaper(preset)} data-background-type={isGradient ? 'gradient' : 'wallpaper'} data-custom-wallpaper={customUrl ? '' : undefined}
      style={isGradient ? {
        '--wallpaper-image': gradientImage(gradientBackground),
        '--wallpaper-base': normalizeGradient(gradientBackground).start,
      } as React.CSSProperties : customUrl ? {
        '--wallpaper-image': `url("${customUrl}")`,
        '--wallpaper-base': '#24282a',
      } as React.CSSProperties : undefined} className="wallpaper-root relative isolate min-h-screen w-full overflow-x-hidden">
      <div data-wallpaper-canvas="" aria-hidden="true" className="wallpaper-canvas fixed inset-0 -z-20 pointer-events-none" />
      <div data-wallpaper-scrim="" aria-hidden="true" className="wallpaper-scrim fixed inset-0 -z-10 pointer-events-none" />
      <div className="relative min-h-screen flex flex-col">{children}</div>
    </div>
  );
};
