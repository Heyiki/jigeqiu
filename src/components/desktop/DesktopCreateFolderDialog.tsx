import { useRef, useState } from 'react';
import { FolderPlus, LoaderCircle } from 'lucide-react';
import { DesktopDialog, desktopDialogButton, desktopDialogInput, useDesktopDialogAction } from './DesktopDialog';

interface DesktopCreateFolderDialogProps {
  language: string;
  shortcutCount: number;
  onCreate(name: string): void | Promise<void>;
  onClose(): void;
}

export function DesktopCreateFolderDialog({ language, shortcutCount, onCreate, onClose }: DesktopCreateFolderDialogProps) {
  const text = (zh: string, en: string) => language === 'en' ? en : zh;
  const [name, setName] = useState(text('新建文件夹', 'New folder'));
  const composing = useRef(false);
  const { busy, error, run } = useDesktopDialogAction(language);
  const close = () => { if (!busy) onClose(); };

  return <DesktopDialog compact label={text('新建桌面文件夹', 'New desktop folder')}
    title={text('新建桌面文件夹', 'New desktop folder')} language={language}
    busy={busy} error={error} onClose={close}>
    <form onSubmit={event => {
      event.preventDefault();
      if (busy || composing.current || !name.trim()) return;
      void run(async () => {
        await onCreate(name.trim());
        onClose();
      });
    }} onKeyDown={event => {
      if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault();
    }}>
      <div className="flex items-start gap-3 py-1">
        <FolderPlus size={40} strokeWidth={1.5} aria-hidden="true" className="mt-4 shrink-0 text-sky-600 dark:text-sky-300" />
        <label className="min-w-0 flex-1 text-xs font-medium">
          {text('文件夹名称', 'Folder name')}
          <input data-autofocus required aria-label={text('文件夹名称', 'Folder name')}
            className={`${desktopDialogInput} mt-1.5 w-full`} value={name} disabled={busy}
            placeholder={text('输入文件夹名称', 'Enter a folder name')}
            onFocus={event => event.currentTarget.select()}
            onCompositionStart={() => { composing.current = true; }}
            onCompositionEnd={() => { composing.current = false; }}
            onChange={event => setName(event.target.value)} />
          {shortcutCount > 0 && <span className="mt-2 block text-xs font-normal text-slate-500 dark:text-slate-400">
            {text(`移入 ${shortcutCount} 个快捷方式`, `${shortcutCount} shortcuts selected`)}
          </span>}
        </label>
      </div>
      <footer className="mt-4 flex flex-wrap justify-end gap-2 border-t border-black/10 pt-3 dark:border-white/10">
        <button type="button" disabled={busy} className={desktopDialogButton} onClick={close}>{text('取消', 'Cancel')}</button>
        <button type="submit" disabled={busy || !name.trim()}
          className={`${desktopDialogButton} !border-sky-600 !bg-sky-600 !text-white hover:!bg-sky-700 dark:!border-sky-500 dark:!bg-sky-500 dark:hover:!bg-sky-600`}>
          {busy ? <LoaderCircle size={14} className="animate-spin" /> : <FolderPlus size={14} />}
          {text('创建文件夹', 'Create folder')}
        </button>
      </footer>
    </form>
  </DesktopDialog>;
}
