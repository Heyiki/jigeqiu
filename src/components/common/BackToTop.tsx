import { useEffect, useId, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { createTranslator } from '../../i18n';

export function BackToTop({ language, showDock = false, dockIconSize = 48 }: {
  language?: string; showDock?: boolean; dockIconSize?: number;
}) {
  const t = createTranslator(language);
  const tipId = useId();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('management-scroll');
    const update = () => setVisible(window.scrollY > 320);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
      root.classList.remove('management-scroll');
    };
  }, []);

  return <div className="back-to-top" hidden={!visible}
    style={{ bottom: showDock ? Math.max(96, dockIconSize + 40) : 24 }}>
    <button type="button" aria-label={t('backToTop')} aria-describedby={tipId}
      onClick={() => {
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
      }}>
      <ArrowUp size={20} aria-hidden="true" strokeWidth={1.8} />
    </button>
    <span id={tipId} role="tooltip">{t('backToTop')}</span>
  </div>;
}
