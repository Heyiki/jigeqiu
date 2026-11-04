import React, { useState } from 'react';
import { ToolWindowWrapper } from './ToolWindowWrapper';
import { FileJson, Copy, Check, Minimize, Sparkles, Trash2, AlertCircle } from 'lucide-react';

interface JsonFormatterToolProps {
  isOpen: boolean;
  onClose: () => void;
}

export const JsonFormatterTool: React.FC<JsonFormatterToolProps> = ({
  isOpen,
  onClose,
}) => {
  const [inputJson, setInputJson] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [indent, setIndent] = useState<2 | 4>(2);

  const sampleJson = {
    appName: "记个球 JIGEQIU",
    version: "1.0.0",
    features: ["液态玻璃界面", "Spotlight 快捷检索", "网址单共享", "插件工具箱"],
    config: {
      theme: "light-glass",
      syncEnabled: true,
      tagsCount: 6
    }
  };

  const handleLoadSample = () => {
    setInputJson(JSON.stringify(sampleJson, null, 2));
    setError(null);
  };

  const handleFormat = (spaceCount: 2 | 4 = indent) => {
    if (!inputJson.trim()) return;
    try {
      const parsed = JSON.parse(inputJson);
      setInputJson(JSON.stringify(parsed, null, spaceCount));
      setError(null);
    } catch (err: any) {
      setError(err.message || '无效的 JSON 格式');
    }
  };

  const handleMinify = () => {
    if (!inputJson.trim()) return;
    try {
      const parsed = JSON.parse(inputJson);
      setInputJson(JSON.stringify(parsed));
      setError(null);
    } catch (err: any) {
      setError(err.message || '无效的 JSON 格式');
    }
  };

  const handleCopy = () => {
    if (!inputJson) return;
    navigator.clipboard.writeText(inputJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <ToolWindowWrapper
      isOpen={isOpen}
      onClose={onClose}
      title="JSON 格式化校验"
      icon={<FileJson size={15} />}
      defaultWidth="max-w-2xl"
    >
      <div className="flex flex-col gap-3 h-full">
        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pb-1 border-b border-slate-200/40 dark:border-white/10">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setIndent(2);
                handleFormat(2);
              }}
              className="px-2.5 py-1 rounded-lg bg-sky-500 text-white font-medium hover:bg-sky-600 transition-colors shadow-2xs"
            >
              2空格缩进
            </button>
            <button
              onClick={() => {
                setIndent(4);
                handleFormat(4);
              }}
              className="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-600 dark:text-sky-300 font-medium hover:bg-sky-500/30 transition-colors"
            >
              4空格缩进
            </button>
            <button
              onClick={handleMinify}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 text-slate-700 dark:text-slate-200 transition-colors"
            >
              <Minimize size={12} />
              <span>压缩单行</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleLoadSample}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-slate-500 hover:text-sky-500 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <Sparkles size={12} />
              <span>载入示例</span>
            </button>
            <button
              onClick={handleCopy}
              disabled={!inputJson}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 text-slate-700 dark:text-slate-200 disabled:opacity-40 transition-colors"
            >
              {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              <span>{copied ? '已复制' : '复制'}</span>
            </button>
            <button
              onClick={() => {
                setInputJson('');
                setError(null);
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-black/5 transition-colors"
              title="清空"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs animate-in fade-in">
            <AlertCircle size={15} className="shrink-0" />
            <span className="font-mono truncate">{error}</span>
          </div>
        )}

        {/* JSON Editor Textarea */}
        <div className="flex-1 min-h-[300px]">
          <textarea
            value={inputJson}
            onChange={e => {
              setInputJson(e.target.value);
              setError(null);
            }}
            placeholder="在此粘贴或输入 JSON 代码..."
            className="w-full h-full min-h-[320px] p-3 text-xs font-mono rounded-2xl bg-black/5 dark:bg-black/30 border border-slate-200/60 dark:border-white/10 focus:outline-none focus:border-sky-500 text-slate-800 dark:text-slate-100 placeholder-slate-400 resize-none"
            spellCheck={false}
          />
        </div>
      </div>
    </ToolWindowWrapper>
  );
};
