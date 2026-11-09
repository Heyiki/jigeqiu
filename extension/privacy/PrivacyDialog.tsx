import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { privacySections, PRIVACY_VERSION } from './content';

export function PrivacyContent() {
  return (
    <>
      <p className="privacy-version">告知版本：{PRIVACY_VERSION}</p>
      {privacySections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <p>{section.text}</p>
        </section>
      ))}
    </>
  );
}

export function PrivacyDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="extension-privacy-dialog"
      aria-labelledby="privacy-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="privacy-dialog-title">隐私说明</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭隐私说明"
          title="关闭隐私说明 (Esc)"
        >
          <X size={20} />
        </button>
      </header>
      <div className="privacy-dialog-body" tabIndex={0}>
        <PrivacyContent />
      </div>
    </dialog>
  );
}
