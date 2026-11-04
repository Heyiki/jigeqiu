import { useEffect, useRef, useState } from 'react';
import type { Locale } from '../i18n';
import {
  createTipDeck, createTipRotation, formatTip, TIP_FADE_MS, watchTipEnvironment,
  type TipSnapshot,
} from '../components/desktop/rotating-tips';

/**
 * phase drives presentation; transitionMs is zero for reduced motion.
 * The caller supplies paused for overlays, editing, hover or other UI conditions.
 * No history is persisted. Locale changes retain the current ID and restart its hold.
 */
export function useRotatingTips({ locale, paused = false }: { locale: Locale; paused?: boolean }) {
  const [snapshot, setSnapshot] = useState<TipSnapshot>(() => ({
    id: createTipDeck()(), phase: 'visible',
  }));
  const [environment, setEnvironment] = useState(() => ({
    hidden: typeof document !== 'undefined' && document.hidden,
    reducedMotion: typeof window !== 'undefined'
      && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false),
  }));
  const rotation = useRef<ReturnType<typeof createTipRotation> | null>(null);
  const initialId = useRef(snapshot.id);

  useEffect(() => {
    const controller = createTipRotation({
      initialId: initialId.current,
      paused: true,
      clock: {
        setTimeout: (run, delay) => window.setTimeout(run, delay),
        clearTimeout: id => window.clearTimeout(id),
      },
    });
    rotation.current = controller;
    const unsubscribe = controller.subscribe(() => setSnapshot(controller.getSnapshot()));
    const unwatch = watchTipEnvironment(
      document, window.matchMedia?.('(prefers-reduced-motion: reduce)'), setEnvironment,
    );
    return () => {
      unwatch();
      unsubscribe();
      controller.destroy();
      rotation.current = null;
    };
  }, []);

  useEffect(() => {
    rotation.current?.configure({
      paused: paused || environment.hidden,
      reducedMotion: environment.reducedMotion,
    });
  }, [locale, paused, environment.hidden, environment.reducedMotion]);

  return {
    ...snapshot,
    text: formatTip(snapshot.id, locale, typeof navigator === 'undefined' ? '' : navigator.platform),
    reducedMotion: environment.reducedMotion,
    transitionMs: environment.reducedMotion ? 0 : TIP_FADE_MS,
  };
}
