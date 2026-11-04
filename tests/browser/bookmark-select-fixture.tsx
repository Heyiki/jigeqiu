import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookmarkTreeSelect } from '../../src/components/common/BookmarkTreeSelect';
import type { Bookmark, Folder } from '../../src/types';
import '../../src/index.css';

const folders = [
  { id: 'work', name: '工作', order: 0 },
  { id: 'dev', name: '开发', parentId: 'work', order: 0 },
] as Folder[];
const bookmarks = [
  { id: 'root', title: '根目录网址', url: 'https://root.test', order: 0, iconMode: 'text' },
  { id: 'git', title: 'GitHub', url: 'https://github.com', folderId: 'dev', order: 0, iconMode: 'text' },
  { id: 'docs', title: '文档', url: 'https://docs.test', folderId: 'work', order: 0, iconMode: 'text' },
] as Bookmark[];
function Fixture() {
  const [single, setSingle] = useState<string>();
  const [multiple, setMultiple] = useState<string[]>([]);
  return <main className="mx-auto max-w-xl space-y-4 p-4">
    <BookmarkTreeSelect label="单选网址" bookmarks={bookmarks} folders={folders} value={single} onChange={setSingle} />
    <BookmarkTreeSelect label="多选网址" bookmarks={bookmarks} folders={folders} multiple value={multiple} onChange={setMultiple} />
    <output aria-label="单选结果">{single}</output>
    <output aria-label="多选结果">{multiple.join(',')}</output>
    <button type="button">外部按钮</button>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
