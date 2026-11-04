import { useEffect, useRef, useState } from 'react';
import { hashForRoute, parseHashRoute, routeTitle, type AppRoute } from '../services/hash-route';

export function useHashRoute(language?: string) {
  const [route, setRoute] = useState(() => parseHashRoute(window.location.hash));
  const closingLaunchpad = useRef(false);

  useEffect(() => {
    function sync() {
      closingLaunchpad.current = false;
      const next = parseHashRoute(window.location.hash);
      const hash = hashForRoute(next);
      if (window.location.hash !== hash) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
      }
      setRoute(previous => hashForRoute(previous) === hash ? previous : next);
    }
    sync();
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  useEffect(() => { document.title = routeTitle(route, language); }, [route, language]);

  function navigate(next: AppRoute) {
    closingLaunchpad.current = false;
    const hash = hashForRoute(next);
    if (window.location.hash !== hash) {
      const state = next.page === 'launchpad' ? { launchpadSource: hashForRoute(parseHashRoute(window.location.hash)) } : null;
      window.history.pushState(state, '', `${window.location.pathname}${window.location.search}${hash}`);
    }
    setRoute(previous => hashForRoute(previous) === hash ? previous : next);
  }

  function closeLaunchpad() {
    if (window.location.hash !== '#/start' || closingLaunchpad.current) return;
    closingLaunchpad.current = true;
    const source = window.history.state?.launchpadSource;
    if (typeof source === 'string' && source !== '#/start' && hashForRoute(parseHashRoute(source)) === source) {
      window.history.back();
    } else {
      const desktop = { page: 'desktop' } as const;
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hashForRoute(desktop)}`);
      setRoute(desktop);
    }
  }

  return { route, navigate, closeLaunchpad };
}
