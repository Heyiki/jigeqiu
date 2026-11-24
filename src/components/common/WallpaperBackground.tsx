import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  const displayedCustom = useRef(custom);
  useLayoutEffect(() => { displayedCustom.current = custom; }, [custom]);
  // Release a displayed image only after React has committed its replacement.
  useEffect(() => () => { if (custom) URL.revokeObjectURL(custom.url); }, [custom]);
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribeWallpaperChange(() => setRevision(value => value + 1)), []);
  useEffect(() => {
    let cancelled = false;
    if (!isGradient && preset === 'custom' && customWallpaperId) {
      void readWallpaper(customWallpaperId).then(async blob => {
        if (cancelled) return;
        if (!blob) { setCustom(null); return; }
        // Saved images have immutable IDs. Focus checks still detect deletion,
        // but must not replace an unchanged image with a fresh Blob URL.
        if (displayedCustom.current?.id === customWallpaperId) return;
        const url = URL.createObjectURL(blob);
        let published = false;
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          if (cancelled) return;
          setCustom({ id: customWallpaperId, url });
          published = true;
        } finally {
          if (!published) URL.revokeObjectURL(url);
        }
      }).catch(() => { if (!cancelled) setCustom(null); });
    } else {
      setCustom(null);
    }
    return () => { cancelled = true; };
  }, [preset, customWallpaperId, revision, isGradient]);
  const customUrl = !isGradient && preset === 'custom' ? custom?.url : undefined;
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
