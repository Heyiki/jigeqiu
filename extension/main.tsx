import { createRoot } from 'react-dom/client';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { PrivacyPage } from './privacy/PrivacyPage';
import { PrivacyDialog } from './privacy/PrivacyDialog';
import { PRIVACY_KEY, PRIVACY_VERSION } from './privacy/content';
import './styles.css';

const App = lazy(() => import('../src/App'));

function acknowledged() {
  try {
    return localStorage.getItem(PRIVACY_KEY) === PRIVACY_VERSION;
  } catch {
    return false;
  }
}

function ExtensionApp() {
  const [ready, setReady] = useState(acknowledged);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === PRIVACY_KEY || event.key === null)
        setReady(acknowledged());
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  if (new URLSearchParams(location.search).has('privacy'))
    return <PrivacyPage />;
  if (!ready)
    return (
      <PrivacyPage
        initial
        onContinue={() => {
          localStorage.setItem(PRIVACY_KEY, PRIVACY_VERSION);
          if (!acknowledged())
            throw new Error('Privacy acknowledgment was not saved');
          setReady(true);
        }}
      />
    );
  return (
    <>
      <Suspense fallback={<p role="status">正在打开工作台…</p>}>
        <App />
      </Suspense>
      <button
        type="button"
        className="extension-privacy-launcher"
        onClick={() => setPrivacyOpen(true)}
        aria-label="隐私说明"
        title="隐私说明"
      >
        <ShieldCheck size={19} />
      </button>
      {privacyOpen && <PrivacyDialog onClose={() => setPrivacyOpen(false)} />}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<ExtensionApp />);
