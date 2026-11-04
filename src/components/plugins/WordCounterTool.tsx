import React, { useState } from 'react';
import { ToolWindowWrapper } from './ToolWindowWrapper';
import { Type, Copy, Check, Trash2, Clock } from 'lucide-react';

interface WordCounterToolProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WordCounterTool: React.FC<WordCounterToolProps> = ({
  isOpen,
  onClose,
}) => {
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);

  // Statistics calculation
  const totalChars = text.length;
  const charsNoSpaces = text.replace(/\s/g, '').length;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWords = (text.match(/[a-zA-Z0-9_-]+/g) || []).length;
  const paragraphs = text
    ? text.split(/\n+/).filter(p => p.trim().length > 0).length
    : 0;
  const lines = text ? text.split('\n').length : 0;

  // Reading time (~350 Chinese characters or ~200 English words per minute)
  const totalReadingUnits = chineseChars + englishWords * 1.5;
  const estimatedReadingMinutes = Math.max(
    1,
    Math.ceil(totalReadingUnits / 350)
  );

  const handleCopy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <ToolWindowWrapper
      isOpen={isOpen}
      onClose={onClose}
      title="文本字数统计"
      icon={<Type size={15} />}
      defaultWidth="max-w-2xl"
    >
      <div className="flex flex-col gap-4">
        {/* Metric Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-slate-200/40 dark:border-white/5 flex flex-col">
            <span className="text-[11px] text-slate-400">中文字数</span>
            <span className="text-xl font-semibold font-mono text-sky-600 dark:text-sky-400 mt-1">
              {chineseChars}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-slate-200/40 dark:border-white/5 flex flex-col">
            <span className="text-[11px] text-slate-400">英文单词</span>
            <span className="text-xl font-semibold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
              {englishWords}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-slate-200/40 dark:border-white/5 flex flex-col">
            <span className="text-[11px] text-slate-400">总字数 (含空格)</span>
            <span className="text-xl font-semibold font-mono text-slate-800 dark:text-slate-100 mt-1">
              {totalChars}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-slate-200/40 dark:border-white/5 flex flex-col">
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <Clock size={12} />
              <span>预估阅读时长</span>
            </div>
            <span className="text-xl font-semibold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              {text.trim() ? `~${estimatedReadingMinutes} 分钟` : '-'}
            </span>
          </div>
        </div>

        {/* Secondary Detailed Stats Bar */}
        <div className="flex items-center gap-4 text-xs text-slate-500 px-1">
          <span>不含空格: <strong className="font-mono text-slate-700 dark:text-slate-300">{charsNoSpaces}</strong></span>
          <span>段落数: <strong className="font-mono text-slate-700 dark:text-slate-300">{paragraphs}</strong></span>
          <span>行数: <strong className="font-mono text-slate-700 dark:text-slate-300">{lines}</strong></span>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={handleCopy}
              disabled={!text}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 text-slate-700 dark:text-slate-200 disabled:opacity-40 transition-colors"
            >
              {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              <span>{copied ? '已复制' : '复制文本'}</span>
            </button>
            <button
              onClick={() => setText('')}
              className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-black/5 transition-colors"
              title="清空"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Text Input Area */}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="在此输入或粘贴需要统计的文章、文案或代码注释..."
          className="w-full h-64 p-3.5 text-sm rounded-2xl bg-black/5 dark:bg-black/30 border border-slate-200/60 dark:border-white/10 focus:outline-none focus:border-sky-500 text-slate-800 dark:text-slate-100 placeholder-slate-400 resize-none leading-relaxed"
        />
      </div>
    </ToolWindowWrapper>
  );
};
