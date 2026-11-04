import { useEffect, useRef } from 'react';
import type { DriveStep, Driver } from 'driver.js';
import { resolveLocale } from '../../i18n';
import { onboardingMessages } from '../../i18n/onboarding';
import 'driver.js/dist/driver.css';
import './onboarding.css';

const requiredAnchors = ['desktop', 'search', 'management', 'guide'] as const;
type RequiredAnchor = typeof requiredAnchors[number];
type TourAnchors = Record<RequiredAnchor, Element> & { launchpad?: Element };

export function buildOnboardingSteps(language: string | undefined, anchors: TourAnchors): DriveStep[] {
  const locale = resolveLocale(language);
  const text = (key: keyof typeof onboardingMessages) => onboardingMessages[key][locale];
  return [
    { element: anchors.desktop, popover: {
      title: text('onboardingTourDesktopTitle'), description: text('onboardingTourDesktopBody'),
    } },
    { element: anchors.search, popover: {
      title: text('onboardingTourSearchTitle'), description: text('onboardingTourSearchBody'),
    } },
    { element: anchors.launchpad, popover: {
      title: text('onboardingTourLaunchpadTitle'),
      description: text('onboardingTourLaunchpadBody') + (anchors.launchpad ? '' : ` ${text('onboardingTourLaunchpadFallback')}`),
    } },
    { element: anchors.management, popover: {
      title: text('onboardingTourManagementTitle'), description: text('onboardingTourManagementBody'),
    } },
    { element: anchors.guide, popover: {
      title: text('onboardingTourGuideTitle'), description: text('onboardingTourGuideBody'),
    } },
  ];
}

function isVisible(element: Element): boolean {
  if (!element.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  for (let current: Element | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
  }
  return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

function visibleAnchor(name: string): Element | undefined {
  return Array.from(document.querySelectorAll(`[data-onboarding="${name}"]`)).find(isVisible);
}

export function waitForOnboardingAnchors(signal: AbortSignal): Promise<TourAnchors | null> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(null); return; }
    let finished = false;
    const finish = (anchors: TourAnchors | null) => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      window.clearTimeout(timeout);
      window.removeEventListener('resize', check);
      signal.removeEventListener('abort', abort);
      resolve(anchors);
    };
    const check = () => {
      const desktop = visibleAnchor('desktop');
      const search = visibleAnchor('search');
      const management = visibleAnchor('management');
      const guide = visibleAnchor('guide');
      if (desktop && search && management && guide) {
        finish({ desktop, search, management, guide, launchpad: visibleAnchor('launchpad') });
      }
    };
    const abort = () => finish(null);
    const observer = new MutationObserver(check);
    const timeout = window.setTimeout(() => finish(null), 3_000);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    window.addEventListener('resize', check);
    signal.addEventListener('abort', abort, { once: true });
    check();
  });
}

export function OnboardingTour({ language, onComplete, onExit, onUnavailable }: {
  language?: string;
  onComplete(): void;
  onExit(): void;
  onUnavailable(): void;
}) {
  const callbacks = useRef({ onComplete, onExit, onUnavailable });
  callbacks.current = { onComplete, onExit, onUnavailable };
  const stepIndex = useRef(0);
  const settled = useRef(false);
  const previousFocus = useRef<HTMLElement | null>(null);
  const locale = resolveLocale(language);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let instance: Driver | undefined;
    let wrapper: HTMLElement | undefined;
    previousFocus.current ??= document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const restoreFocus = () => {
      if (previousFocus.current?.isConnected && isVisible(previousFocus.current)) {
        previousFocus.current.focus({ preventScroll: true });
      }
    };
    const controls = () => wrapper ? Array.from(wrapper.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
    )).filter(isVisible) : [];
    const focusTour = () => (controls()[0] ?? wrapper)?.focus({ preventScroll: true });
    const finish = (outcome: 'onComplete' | 'onExit' | 'onUnavailable') => {
      if (disposed || settled.current) return;
      settled.current = true;
      controller.abort();
      removeListeners();
      // Driver restores its own last-step focus after onDestroyed. Restore ours last,
      // before notifying the controller, which may open the next task dialog.
      queueMicrotask(() => {
        if (disposed) return;
        restoreFocus();
        callbacks.current[outcome]();
      });
    };
    const keydown = (event: KeyboardEvent) => {
      if (!wrapper) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        instance?.destroy();
        finish('onExit');
      } else if (event.key === 'Tab') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const items = controls();
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey
          ? (index <= 0 ? items.length - 1 : index - 1)
          : (index + 1) % items.length;
        (items[next] ?? wrapper).focus({ preventScroll: true });
      } else {
        // Keep desktop shortcuts from firing behind the tour.
        event.stopPropagation();
        if (event.key.startsWith('Arrow')) event.preventDefault();
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (wrapper) event.stopImmediatePropagation();
    };
    const focusin = (event: FocusEvent) => {
      if (wrapper && event.target instanceof Node && !wrapper.contains(event.target)) focusTour();
    };
    function removeListeners() {
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('keyup', keyup, true);
      document.removeEventListener('focusin', focusin, true);
      wrapper = undefined;
    }
    async function start() {
      try {
        const [{ driver }, anchors] = await Promise.all([
          import('driver.js'), waitForOnboardingAnchors(controller.signal),
        ]);
        if (disposed || settled.current) return;
        const competingDialog = Array.from(document.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"]')).some(isVisible);
        if (!anchors || competingDialog) { finish('onUnavailable'); return; }
        const text = (key: keyof typeof onboardingMessages) => onboardingMessages[key][locale];
        instance = driver({
          steps: buildOnboardingSteps(locale, anchors),
          animate: false,
          smoothScroll: false,
          allowKeyboardControl: false,
          disableActiveInteraction: true,
          overlayClickBehavior: 'none',
          popoverClass: 'onboarding-tour',
          showProgress: true,
          progressText: text('onboardingProgress'),
          showButtons: ['next', 'previous', 'close'],
          nextBtnText: text('onboardingNext'),
          prevBtnText: text('onboardingPrev'),
          doneBtnText: text('onboardingDone'),
          closeBtnLabel: text('onboardingExit'),
          // Driver may close before its next-frame active-step bookkeeping runs.
          // Own button outcomes so application state never depends on that frame.
          onCloseClick: () => {
            instance?.destroy();
            finish('onExit');
          },
          onDoneClick: () => {
            instance?.destroy();
            finish('onComplete');
          },
          onPopoverRender: popover => {
            wrapper = popover.wrapper;
            wrapper.tabIndex = -1;
            wrapper.lang = locale === 'zh' ? 'zh-CN' : 'en';
            wrapper.setAttribute('role', 'dialog');
            wrapper.setAttribute('aria-modal', 'true');
            popover.closeButton.title = text('onboardingExit');
            focusTour();
          },
          onHighlighted: (_element, _step, { index }) => {
            stepIndex.current = index ?? 0;
          },
          onDestroyed: (_element, _step, { reason }) => {
            if (!disposed) finish(reason === 'done' ? 'onComplete' : 'onExit');
          },
        });
        window.addEventListener('keydown', keydown, true);
        window.addEventListener('keyup', keyup, true);
        document.addEventListener('focusin', focusin, true);
        instance.drive(stepIndex.current);
      } catch {
        finish('onUnavailable');
        instance?.destroy();
      }
    }
    if (!settled.current) void start();
    return () => {
      disposed = true;
      controller.abort();
      stepIndex.current = instance?.getActiveIndex() ?? stepIndex.current;
      removeListeners();
      instance?.destroy();
      restoreFocus();
    };
  }, [locale]);

  return null;
}
