import type { Locale } from '../../i18n';
import { tipIds, tipMessages, type TipId } from '../../i18n/tips';

export const TIP_VISIBLE_MS = 8000;
export const TIP_FADE_MS = 150;
export type TipPhase = 'visible' | 'fadeOut' | 'fadeIn';
export type TipSnapshot = { id: TipId; phase: TipPhase };

export function tipModifier(platform: string): string {
  return /Mac|iPhone|iPad/.test(platform) ? '⌘' : 'Ctrl';
}

export function formatTip(id: TipId, locale: Locale, platform: string): string {
  return tipMessages[id][locale].replaceAll('{mod}', tipModifier(platform));
}

/** Each in-memory deck visits every ID once; cycle boundaries never repeat. */
export function createTipDeck(rng: () => number = Math.random, firstId?: TipId): () => TipId {
  let deck: TipId[] = [];
  let previous: TipId | undefined;
  return () => {
    if (!deck.length) {
      deck = [...tipIds];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      if (firstId) {
        const index = deck.indexOf(firstId);
        [deck[0], deck[index]] = [deck[index], deck[0]];
        firstId = undefined;
      } else if (deck[0] === previous) {
        [deck[0], deck[1]] = [deck[1], deck[0]];
      }
    }
    previous = deck.shift()!;
    return previous;
  };
}

export interface TipClock {
  setTimeout: (run: () => void, delay: number) => number;
  clearTimeout: (id: number) => void;
}

type RotationOptions = {
  paused?: boolean;
  reducedMotion?: boolean;
};

/** configure always restarts the hold without consuming an ID, including locale resets. */
export function createTipRotation(options: RotationOptions & {
  clock: TipClock;
  rng?: () => number;
  initialId?: TipId;
}) {
  const next = createTipDeck(options.rng, options.initialId);
  let snapshot: TipSnapshot = { id: next(), phase: 'visible' };
  let paused = options.paused ?? false;
  let reducedMotion = options.reducedMotion ?? false;
  let timer: number | undefined;
  let destroyed = false;
  const listeners = new Set<() => void>();

  function publish(id: TipId, phase: TipPhase) {
    if (snapshot.id === id && snapshot.phase === phase) return;
    snapshot = { id, phase };
    listeners.forEach(listener => listener());
  }

  function cancel() {
    if (timer !== undefined) options.clock.clearTimeout(timer);
    timer = undefined;
  }

  function schedule(delay: number, run: () => void) {
    timer = options.clock.setTimeout(() => {
      timer = undefined;
      if (!destroyed) run();
    }, delay);
  }

  function hold() {
    if (paused || destroyed) return;
    schedule(TIP_VISIBLE_MS, () => {
      if (reducedMotion) {
        publish(next(), 'visible');
        hold();
      } else {
        publish(snapshot.id, 'fadeOut');
        schedule(TIP_FADE_MS, () => {
          publish(next(), 'fadeIn');
          schedule(TIP_FADE_MS, () => {
            publish(snapshot.id, 'visible');
            hold();
          });
        });
      }
    });
  }

  hold();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    configure(update: RotationOptions) {
      if (destroyed) return;
      paused = update.paused ?? paused;
      reducedMotion = update.reducedMotion ?? reducedMotion;
      cancel();
      publish(snapshot.id, 'visible');
      hold();
    },
    destroy() {
      destroyed = true;
      cancel();
      listeners.clear();
    },
  };
}

type TipEnvironment = { hidden: boolean; reducedMotion: boolean };

export function watchTipEnvironment(
  doc: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>,
  media: Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'> | undefined,
  onChange: (environment: TipEnvironment) => void,
) {
  const sync = () => onChange({ hidden: doc.hidden, reducedMotion: media?.matches ?? false });
  doc.addEventListener('visibilitychange', sync);
  media?.addEventListener('change', sync);
  sync();
  return () => {
    doc.removeEventListener('visibilitychange', sync);
    media?.removeEventListener('change', sync);
  };
}
