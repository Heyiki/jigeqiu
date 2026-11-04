import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Link, Plus, Save, Trash2, X } from 'lucide-react';
import type { Bookmark, Collection, Folder } from '../../types';
import { BookmarkTreeSelect } from '../common/BookmarkTreeSelect';
import type { CollectionItem, CollectionSection } from '../../domain/assets/model';
import { bookmarkCollectionItem, buildCollectionData, collectionSections } from '../../services/collection-content';
import { normalizeBookmarkUrl } from '../../services/bookmark-input';
import { Modal } from '../common/Modal';

interface CollectionEditorProps {
  collection?: Collection;
  allBookmarks: Bookmark[];
  folders?: Folder[];
  language?: string;
  onSave: (data: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>) => void | Promise<void>;
  onClose: () => void;
}

const newSection = (): CollectionSection => ({
  id: crypto.randomUUID(), title: '', description: '', items: [],
});

function reorder<T>(values: T[], index: number, direction: -1 | 1): T[] {
  const next = index + direction;
  if (index < 0 || next < 0 || next >= values.length) return values;
  const result = [...values];
  [result[index], result[next]] = [result[next], result[index]];
  return result;
}

export function CollectionEditor({ collection, allBookmarks, folders = [], language = 'zh', onSave, onClose }: CollectionEditorProps) {
  const en = language.toLowerCase().startsWith('en');
  const text = (zh: string, english: string) => en ? english : zh;
  const [initial] = useState(() => ({
    title: collection?.title ?? '',
    description: collection?.description ?? '',
    sections: collection ? structuredClone(collectionSections(collection)) : [newSection()],
  }));
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [sections, setSections] = useState(initial.sections);
  const [targetSectionId, setTargetSectionId] = useState(initial.sections[0]?.id ?? '');
  const [selected, setSelected] = useState<string[]>([]);
  const [manualTitle, setManualTitle] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const dirty = JSON.stringify({ title, description, sections }) !== JSON.stringify(initial)
    || manualTitle !== '' || manualUrl !== '' || selected.length > 0;
  const target = sections.find(section => section.id === targetSectionId) ?? sections[0];

  function requestClose() {
    if (saving.current) return;
    if (!dirty || confirm(text('放弃未保存的修改？', 'Discard unsaved changes?'))) onClose();
  }

  function updateSection(id: string, update: Partial<CollectionSection>) {
    if (saving.current) return;
    setSections(previous => previous.map(section => section.id === id ? { ...section, ...update } : section));
  }

  function updateItem(sectionId: string, itemId: string, update: Partial<CollectionItem>) {
    if (saving.current) return;
    setSections(previous => previous.map(section => section.id === sectionId
      ? { ...section, items: section.items.map(item => item.id === itemId ? { ...item, ...update } : item) }
      : section));
  }

  function addSection() {
    if (saving.current) return;
    const section = newSection();
    setSections(previous => [...previous, section]);
    setTargetSectionId(section.id);
  }

  function addItems(items: CollectionItem[]) {
    if (saving.current || !items.length) return;
    setSections(previous => target
      ? previous.map(section => section.id === target.id ? { ...section, items: [...section.items, ...items] } : section)
      : [...previous, { ...newSection(), items }]);
    setError('');
  }

  function addSelected() {
    if (saving.current) return;
    try {
      addItems(selected.flatMap(id => {
        const bookmark = allBookmarks.find(value => value.id === id);
        return bookmark ? [bookmarkCollectionItem(bookmark)] : [];
      }));
      setSelected([]);
    } catch (cause) {
      setError(saveError(cause));
    }
  }

  function addManual() {
    if (saving.current) return;
    try {
      const url = normalizeBookmarkUrl(manualUrl);
      addItems([{
        id: crypto.randomUUID(), bookmarkId: null,
        title: manualTitle.trim() || new URL(url).hostname,
        url, icon: null, recommendationReason: '',
      }]);
      setManualTitle('');
      setManualUrl('');
    } catch {
      setError(text('请输入有效的 HTTP 或 HTTPS 网址。', 'Enter a valid HTTP or HTTPS URL.'));
    }
  }

  function saveError(cause: unknown) {
    const code = cause instanceof DOMException && cause.name === 'QuotaExceededError'
      ? 'QUOTA_EXCEEDED' : cause instanceof Error ? cause.message : '';
    switch (code) {
      case 'TITLE_REQUIRED': return text('请输入网址单标题。', 'Enter a collection title.');
      case 'ITEM_TITLE_REQUIRED': return text('每个条目都需要名称，请检查后保存。', 'Every item needs a title. Check the items before saving.');
      case 'CONTENT_TOO_LONG': return text('内容过长，请缩短标题、正文或条目介绍后重试。', 'Content is too long. Shorten titles, body text or introductions and retry.');
      case 'INVALID_URL': return text('条目网址无效，请使用 HTTP 或 HTTPS 网址。', 'An item URL is invalid. Use an HTTP or HTTPS URL.');
      case 'INVALID_INPUT': return text('请检查必填名称和条目内容。', 'Check required titles and item content.');
      case 'QUOTA_EXCEEDED': return text('浏览器存储空间不足，草稿已保留，请释放空间后重试。', 'Browser storage is full. Your draft is kept; free space and retry.');
      case 'CONFLICT':
      case 'PREVIEW_STALE': return text('数据已发生变化，未能保存。请保留当前草稿后重试。', 'The data has changed. Your draft is kept; retry saving.');
      default: return text('保存失败，草稿已保留，请重试。', 'Saving failed. Your draft is kept; please retry.');
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    if (manualTitle !== '' || manualUrl !== '') {
      setError(text('请先添加手动网址或清空输入，再保存。', 'Add the manual URL or clear its fields before saving.'));
      return;
    }
    if (selected.length > 0) {
      setError(text('请先添加选中的收藏或取消勾选，再保存。', 'Add the selected bookmarks or deselect them before saving.'));
      return;
    }
    if (!title.trim()) {
      setError(text('请输入网址单标题。', 'Enter a collection title.'));
      return;
    }
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const data = buildCollectionData(collection, title, description, sections);
      await onSave(data);
    } catch (cause) {
      if (mounted.current) setError(saveError(cause));
      return;
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
    if (mounted.current) onClose();
  }

  const inputClass = 'w-full min-w-0 px-3 py-2 rounded-lg border border-slate-300 dark:border-white/20 bg-white/60 dark:bg-black/20 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600';
  const buttonClass = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-white/20 text-xs disabled:opacity-40 disabled:cursor-not-allowed';
  const toolClass = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed';
  const sectionLabel = (index: number) => text(`章节 ${index + 1}`, `Section ${index + 1}`);
  const itemLabel = (section: number, item: number) => text(`条目 ${section + 1}.${item + 1}`, `Item ${section + 1}.${item + 1}`);

  return <Modal isOpen onClose={requestClose} contained maxWidth="3xl"
    title={collection ? text('编辑网址单', 'Edit Collection') : text('新建网址单', 'New Collection')}>
    <form onSubmit={submit} className="min-w-0 space-y-5">
      <fieldset disabled={busy} className="min-w-0 space-y-5">
        <div className="space-y-3">
          <label className="block text-xs font-semibold space-y-1.5">
            <span>{text('网址单标题', 'Collection title')} <span className="text-rose-600">*</span></span>
            <input aria-label={text('网址单标题', 'Collection title')} value={title} onChange={event => setTitle(event.target.value)}
              className={inputClass} maxLength={1024} required autoFocus />
          </label>
          <label className="block text-xs font-semibold space-y-1.5">
            <span>{text('简介', 'Description')}</span>
            <textarea aria-label={text('简介', 'Collection description')} value={description}
              onChange={event => setDescription(event.target.value)} maxLength={32768} rows={2} className={`${inputClass} resize-y`} />
          </label>
        </div>

        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{text('章节与网址', 'Sections and URLs')}</h3>
          <button type="button" aria-label={text('添加章节', 'Add section')} onClick={addSection} className={buttonClass}>
            <Plus size={14} />{text('添加章节', 'Add Section')}
          </button>
        </div>
        <div className="space-y-6">
          {sections.map((section, sectionIndex) => <section key={section.id} aria-label={sectionLabel(sectionIndex)}
            className="min-w-0 border-t border-slate-200 dark:border-white/10 pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold">{sectionLabel(sectionIndex)}</h4>
              <div className="flex items-center gap-1">
                <button type="button" className={toolClass} disabled={sectionIndex === 0}
                  aria-label={text(`上移章节 ${sectionIndex + 1}`, `Move section ${sectionIndex + 1} up`)}
                  title={text('上移章节', 'Move section up')}
                  onClick={() => setSections(previous => reorder(previous, sectionIndex, -1))}><ArrowUp size={15} /></button>
                <button type="button" className={toolClass} disabled={sectionIndex === sections.length - 1}
                  aria-label={text(`下移章节 ${sectionIndex + 1}`, `Move section ${sectionIndex + 1} down`)}
                  title={text('下移章节', 'Move section down')}
                  onClick={() => setSections(previous => reorder(previous, sectionIndex, 1))}><ArrowDown size={15} /></button>
                <button type="button" className={`${toolClass} text-rose-600 dark:text-rose-400`}
                  aria-label={text(`删除章节 ${sectionIndex + 1}`, `Delete section ${sectionIndex + 1}`)}
                  title={text('删除章节及条目', 'Delete section and its items')}
                  onClick={() => setSections(previous => previous.filter(value => value.id !== section.id))}><Trash2 size={15} /></button>
              </div>
            </div>
            <label className="block text-xs space-y-1.5">
              <span>{text('章节标题', 'Section title')}</span>
              <input aria-label={text(`章节标题 ${sectionIndex + 1}`, `Section ${sectionIndex + 1} title`)} maxLength={1024} value={section.title}
                onChange={event => updateSection(section.id, { title: event.target.value })} className={inputClass} />
            </label>
            <label className="block text-xs space-y-1.5">
              <span>{text('章节正文', 'Section body')}</span>
              <textarea aria-label={text(`章节正文 ${sectionIndex + 1}`, `Section ${sectionIndex + 1} body`)} maxLength={32768} value={section.description}
                onChange={event => updateSection(section.id, { description: event.target.value })}
                className={`${inputClass} resize-y whitespace-pre-wrap`} rows={3} />
            </label>
            <div className="space-y-3">
              {section.items.map((item, itemIndex) => <div key={item.id}
                className="min-w-0 rounded-lg border border-slate-200 dark:border-white/15 p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium">{itemLabel(sectionIndex, itemIndex)}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" className={toolClass} disabled={itemIndex === 0}
                      aria-label={text(`上移条目 ${sectionIndex + 1}.${itemIndex + 1}`, `Move item ${sectionIndex + 1}.${itemIndex + 1} up`)}
                      title={text('上移条目', 'Move item up')}
                      onClick={() => updateSection(section.id, { items: reorder(section.items, itemIndex, -1) })}><ArrowUp size={14} /></button>
                    <button type="button" className={toolClass} disabled={itemIndex === section.items.length - 1}
                      aria-label={text(`下移条目 ${sectionIndex + 1}.${itemIndex + 1}`, `Move item ${sectionIndex + 1}.${itemIndex + 1} down`)}
                      title={text('下移条目', 'Move item down')}
                      onClick={() => updateSection(section.id, { items: reorder(section.items, itemIndex, 1) })}><ArrowDown size={14} /></button>
                    <button type="button" className={`${toolClass} text-rose-600 dark:text-rose-400`}
                      aria-label={text(`删除条目 ${sectionIndex + 1}.${itemIndex + 1}`, `Delete item ${sectionIndex + 1}.${itemIndex + 1}`)}
                      title={text('删除条目', 'Delete item')}
                      onClick={() => updateSection(section.id, { items: section.items.filter(value => value.id !== item.id) })}><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block min-w-0 text-xs space-y-1.5">
                    <span>{text('名称', 'Title')}</span>
                    <input aria-label={text(`条目名称 ${sectionIndex + 1}.${itemIndex + 1}`, `Item ${sectionIndex + 1}.${itemIndex + 1} title`)} maxLength={1024} value={item.title} required
                      onChange={event => updateItem(section.id, item.id, { title: event.target.value })} className={inputClass} />
                  </label>
                  <label className="block min-w-0 text-xs space-y-1.5">
                    <span>URL</span>
                    <input aria-label={text(`条目网址 ${sectionIndex + 1}.${itemIndex + 1}`, `Item ${sectionIndex + 1}.${itemIndex + 1} URL`)} maxLength={8192} value={item.url} required inputMode="url"
                      onChange={event => updateItem(section.id, item.id, { url: event.target.value })} className={inputClass} />
                  </label>
                </div>
                <label className="block text-xs space-y-1.5">
                  <span>{text('条目介绍', 'Introduction')}</span>
                  <textarea aria-label={text(`条目介绍 ${sectionIndex + 1}.${itemIndex + 1}`, `Item ${sectionIndex + 1}.${itemIndex + 1} introduction`)}
                    value={item.recommendationReason} maxLength={32768} rows={2} className={`${inputClass} resize-y`}
                    onChange={event => updateItem(section.id, item.id, { recommendationReason: event.target.value })} />
                </label>
              </div>)}
            </div>
          </section>)}
        </div>

        <section className="min-w-0 border-t border-slate-200 dark:border-white/10 pt-4 space-y-4"
          aria-label={text('添加网址', 'Add URLs')}>
          <label className="block text-xs font-semibold space-y-1.5">
            <span>{text('目标章节', 'Target section')}</span>
            <select aria-label={text('目标章节', 'Target section')} value={target?.id ?? ''}
              onChange={event => setTargetSectionId(event.target.value)} className={inputClass}>
              {sections.length === 0 && <option value="">{text('新章节', 'New section')}</option>}
              {sections.map((section, index) => <option key={section.id} value={section.id}>
                {section.title || sectionLabel(index)}
              </option>)}
            </select>
          </label>
          <div className="space-y-3">
            <BookmarkTreeSelect bookmarks={allBookmarks} folders={folders} language={language}
              multiple value={selected} onChange={setSelected} disabled={busy} />
            <button type="button" aria-label={text('从收藏选择', 'Add selected bookmarks')} onClick={addSelected}
              disabled={selected.length === 0} className={buttonClass}>
              <Check size={14} />{text('从收藏选择', 'Add Selected')} ({selected.length})
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block min-w-0 text-xs space-y-1.5">
              <span>{text('名称（可选）', 'Title (optional)')}</span>
              <input aria-label={text('手动网址名称', 'Manual title')} maxLength={1024} value={manualTitle}
                onChange={event => setManualTitle(event.target.value)} className={inputClass} />
            </label>
            <label className="block min-w-0 text-xs space-y-1.5">
              <span>URL</span>
              <input aria-label={text('手动网址 URL', 'Manual URL')} maxLength={8192} value={manualUrl} inputMode="url"
                onChange={event => setManualUrl(event.target.value)} className={inputClass} />
            </label>
          </div>
          <button type="button" aria-label={text('手动添加网址', 'Add URL')} disabled={!manualUrl.trim()} onClick={addManual} className={buttonClass}>
            <Link size={14} />{text('手动添加网址', 'Add URL')}
          </button>
        </section>
      </fieldset>
      {error && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300 leading-relaxed">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 dark:border-white/10 pt-4">
        <button type="button" aria-label={text('取消', 'Cancel')} disabled={busy} onClick={requestClose} className={buttonClass}>
          <X size={14} />{text('取消', 'Cancel')}
        </button>
        <button type="submit" aria-label={text('保存', 'Save Collection')} disabled={busy} className={`${buttonClass} bg-teal-700 text-white`}>
          <Save size={14} />{busy ? text('正在保存…', 'Saving…') : text('保存', 'Save Collection')}
        </button>
      </div>
    </form>
  </Modal>;
}
