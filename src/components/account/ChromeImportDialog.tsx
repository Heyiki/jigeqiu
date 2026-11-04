import { useEffect, useRef, useState } from 'react';
import { FileUp, Upload, X } from 'lucide-react';
import type { SnapshotStore } from '../../services/persistence/snapshot-store';
import { createImportService } from '../../services/import-export/import-service';
import type { ImportNode, ImportPreview } from '../../services/import-export/model';
import { ASSET_LIMITS } from '../../domain/assets/validation';
import { describeAssetError } from '../../services/import-export/ui-errors';

interface Props {
  store: SnapshotStore;
  onClose(): void;
  onImported(count: number): Promise<void>;
}

export function ChromeImportDialog({ store, onClose, onImported }: Props) {
  const [service] = useState(() => createImportService(store));
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef(0);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      request.current += 1;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  async function choose(file: File | undefined) {
    if (!file || saving.current) return;
    const ticket = ++request.current;
    setBusy(true);
    setError('');
    setPreview(null);
    setFileName(file.name);
    try {
      if (file.size > ASSET_LIMITS.bytes) {
        setError(describeAssetError('IMPORT_TOO_LARGE'));
        return;
      }
      const text = await file.text();
      if (request.current !== ticket) return;
      const parsed = service.parseHtml(text);
      if (!parsed.ok) { setError(describeAssetError(parsed.error.code)); return; }
      const current = await store.read();
      if (request.current !== ticket) return;
      if (!current.ok) { setError(describeAssetError(current.error.code)); return; }
      if (current.value.kind === 'legacy') { setError(describeAssetError('LEGACY_REQUIRES_PREVIEW')); return; }
      let count = 0;
      const walk = (nodes: ImportNode[]) => nodes.forEach(node => {
        count++;
        if (node.kind === 'folder') walk(node.children);
      });
      walk(parsed.value.roots);
      const result = service.preview(parsed.value, {
        target: { kind: 'existing', folderId: null },
        duplicateBookmarks: 'skip', duplicateCollections: 'skip-identical',
        folderBindings: [], missingParents: 'reject', missingBookmarkLinks: 'reject',
      }, {
        base: current.value.kind === 'ready' ? current.value.envelope.snapshot : {
          library: { bookmarks: [], folders: [], root: [] },
          layout: { shortcuts: [], folders: [], root: [], dock: [] }, collections: [], trash: [],
        },
        expected: current.value.kind === 'ready' ? current.value.envelope.version : null,
        previewId: crypto.randomUUID(), at: Date.now(),
        candidateIds: Array.from({ length: count }, () => crypto.randomUUID()),
      });
      if (result.ok) setPreview(result.value);
      else setError(describeAssetError(result.error.code));
    } catch {
      if (request.current === ticket) setError('文件读取失败，请重新选择文件。');
    } finally {
      if (request.current === ticket) setBusy(false);
    }
  }
  async function confirm() {
    if (!preview || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await service.commit(preview);
      if (!result.ok) { setError(describeAssetError(result.error.code)); return; }
      const count = result.value.mappings.filter(item => item.kind === 'bookmark' && item.disposition === 'created').length;
      await onImported(count);
    } catch {
      setError('保存结果无法确认，请刷新检查本机收藏，不要清空浏览器数据。');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const created = preview?.mappings.filter(item => item.disposition === 'created') ?? [];
  const bookmarkCount = created.filter(item => item.kind === 'bookmark').length;
  const folderCount = created.filter(item => item.kind === 'folder').length;
  return <dialog className="ws-dialog" ref={dialog} aria-labelledby="chrome-import-title"
    onCancel={event => { event.preventDefault(); if (!saving.current) onClose(); }}>
    <header className="ws-dialog-header">
      <h2 id="chrome-import-title">导入 Chrome 书签</h2>
      <button className="ws-icon-button" disabled={busy} aria-label="关闭导入" title="关闭" onClick={onClose}><X size={20} /></button>
    </header>
    <div className="ws-dialog-body">
      <p className="ws-import-help">在 Chrome 书签管理器中导出书签，然后选择 HTML 文件。</p>
      <label className="ws-file">
        <FileUp size={28} />
        <span>{fileName || '选择 Chrome 书签文件'}</span>
        <input type="file" accept=".html,.htm,text/html" aria-label="Chrome 书签 HTML 文件" disabled={busy}
          onChange={event => { void choose(event.target.files?.[0]); event.target.value = ''; }} />
      </label>
      {busy && <p role="status">{saving.current ? '正在保存…' : '正在读取…'}</p>}
      {preview && <div className="ws-preview" role="status">
        <strong>{bookmarkCount} 个网址</strong><span>{folderCount} 个文件夹</span>
        <span>跳过 {preview.counts.skipped} 项重复内容</span>
        {preview.counts.invalid > 0 && <span>忽略 {preview.counts.invalid} 个无效网址</span>}
      </div>}
      {error && <p className="ws-alert" role="alert">{error}</p>}
    </div>
    <footer className="ws-dialog-footer">
      <button className="ws-button" disabled={busy} onClick={onClose}>取消</button>
      <button className="ws-button ws-primary" disabled={busy || !preview || created.length === 0} onClick={() => void confirm()}>
        <Upload size={16} />确认导入
      </button>
    </footer>
  </dialog>;
}
