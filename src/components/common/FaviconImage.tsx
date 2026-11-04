import React, { useEffect, useId, useRef, useState } from 'react';
import { Globe } from 'lucide-react';
import { getIconFallback, getIconFallbackTone } from '../../services/icon-fallback';
import { peekSiteIcon, watchSiteIcon, type SiteIconRequest } from '../../services/site-icons';

interface FaviconImageProps extends SiteIconRequest {
  title: string;
  /** Retained for saved-bookmark compatibility; never applied to website artwork. */
  iconBg?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showTitle?: boolean;
}

function TextIcon({ title, url }: { title: string; url: string }) {
  const id = useId();
  const fallback = getIconFallback(title, url);
  return <div className="site-icon-fallback" data-fallback-kind={fallback.kind}
    data-fallback-tone={getIconFallbackTone(title, url)} aria-hidden="true">
    {fallback.kind === 'generic' ? <Globe className="h-3/5 w-3/5" strokeWidth={1.75} /> :
      <svg viewBox="0 0 64 64" width="100%" height="100%" focusable="false"
        className={`site-icon-glyph${fallback.kind === 'han-pair' ? ' site-icon-glyph-han-pair' : ''}`}>
        {fallback.kind === 'han-pair' ? <>
          <defs>
            <clipPath id={`${id}-right`}><rect x="0" y="0" width="32" height="64" /></clipPath>
            <clipPath id={`${id}-left`}><rect x="32" y="0" width="32" height="64" /></clipPath>
          </defs>
          {/* Full glyphs clipped to the specified halves, with identical geometry at every size. */}
          <text x="0" y="32" clipPath={`url(#${id}-right)`} data-half="right">{fallback.first}</text>
          <text x="64" y="32" clipPath={`url(#${id}-left)`} data-half="left">{fallback.second}</text>
        </> : <text x="32" y="32">{fallback.text}</text>}
      </svg>}
  </div>;
}

function ResolvedIcon({ url, title, icon, iconMode, platformIcon, size = 'md', className = '', showTitle = true }: FaviconImageProps) {
  const [state, setState] = useState(() => peekSiteIcon({ url, icon, iconMode, platformIcon }));
  const [failedSrc, setFailedSrc] = useState('');
  const [watching, setWatching] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let started = false;
    let unsubscribe = () => {};
    const start = () => {
      if (started) return;
      started = true;
      setWatching(true);
      unsubscribe = watchSiteIcon({ url, icon, iconMode, platformIcon }, next => {
        setFailedSrc('');
        setState(next);
      });
    };
    if (typeof IntersectionObserver === 'undefined' || !root.current) {
      start();
      return () => unsubscribe();
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        start();
      }
    }, { rootMargin: '128px' });
    observer.observe(root.current);
    return () => { observer.disconnect(); unsubscribe(); };
  }, [url, icon, iconMode, platformIcon]);
  const src = state.status === 'ready' && state.src !== failedSrc ? state.src : undefined;
  return <div ref={root}
    className={`site-icon site-icon-${size} ${className}`} data-site-icon="" data-icon-state={src ? 'ready' : state.status === 'loading' ? watching ? 'loading' : 'deferred' : 'fallback'}
    role="img" aria-label={title || 'Website'} title={showTitle ? title : undefined}
    style={{ background: 'transparent', borderRadius: 0, overflow: 'visible', letterSpacing: 0 }}>
    {src ? <img src={src} alt="" referrerPolicy="no-referrer" draggable={false}
      onError={() => setFailedSrc(src)} className="site-icon-image" /> : <TextIcon title={title} url={url} />}
  </div>;
}

export function FaviconImage(props: FaviconImageProps) {
  // A changed source must never show a previously rendered website's artwork.
  return <ResolvedIcon key={JSON.stringify([props.url, props.icon, props.iconMode, props.platformIcon])} {...props} />;
}
