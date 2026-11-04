import React, { useState } from 'react';
import { Plugin } from '../../types';
import {
  Puzzle,
  Github,
  Shield,
  Download,
  Trash2,
  ExternalLink,
  Pin,
  PinOff,
  Check,
  AlertCircle,
  Play,
  HelpCircle,
  Wrench,
  Calculator,
  FileJson,
  Type,
  Pipette,
  Sparkles,
} from 'lucide-react';
import { Modal } from '../common/Modal';

interface PluginsViewProps {
  plugins: Plugin[];
  onToggleInstall: (pluginId: string) => void;
  onTogglePin: (pluginId: string) => void;
  onLaunchTool: (toolType: 'calculator' | 'json-formatter' | 'word-counter') => void;
}

export const PluginsView: React.FC<PluginsViewProps> = ({
  plugins,
  onToggleInstall,
  onTogglePin,
  onLaunchTool,
}) => {
  const [selectedPluginForPerms, setSelectedPluginForPerms] = useState<Plugin | null>(null);
  const [infoModalPlugin, setInfoModalPlugin] = useState<Plugin | null>(null);

  const getPluginIcon = (plugin: Plugin) => {
    switch (plugin.toolType) {
      case 'calculator':
        return <Calculator size={24} className="text-amber-500" />;
      case 'json-formatter':
        return <FileJson size={24} className="text-emerald-500" />;
      case 'word-counter':
        return <Type size={24} className="text-sky-500" />;
      default:
        if (plugin.icon === 'Pipette') {
          return <Pipette size={24} className="text-purple-500" />;
        }
        return <Sparkles size={24} className="text-pink-500" />;
    }
  };

  const handleInstallClick = (plugin: Plugin) => {
    if (plugin.installed) {
      // Uninstall confirmation
      if (confirm(`确定卸载插件「${plugin.name}」吗？`)) {
        onToggleInstall(plugin.id);
      }
    } else {
      // Show permissions confirmation modal first
      setSelectedPluginForPerms(plugin);
    }
  };

  const confirmInstall = () => {
    if (selectedPluginForPerms) {
      onToggleInstall(selectedPluginForPerms.id);
      setSelectedPluginForPerms(null);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-8 py-8">
      {/* Header */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-6 mb-8 border border-slate-300/90 dark:border-white/10 shadow-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center border border-sky-500/20 shadow-2xs">
            <Puzzle size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 dark:text-slate-100">
              插件与扩展空间
            </h1>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium mt-1">
              由 GitHub 开发者与记个球社区提供的免费、开源实用工具箱，选择性安装至桌面
            </p>
          </div>
        </div>
      </div>

      {/* Grid of Plugins */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {plugins.map(plugin => (
          <div
            key={plugin.id}
            className="liquid-glass rounded-3xl p-5 border border-white/60 dark:border-white/10 shadow-lg flex flex-col justify-between group hover:border-sky-500/40 transition-all duration-200"
          >
            <div>
              {/* Card Top */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-black/5 dark:bg-white/5 flex items-center justify-center shrink-0">
                    {getPluginIcon(plugin)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                        {plugin.name}
                      </h3>
                      <span className="text-[11px] font-mono text-slate-400 bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">
                        v{plugin.version}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 block mt-0.5">
                      作者: {plugin.author}
                    </span>
                  </div>
                </div>

                {/* Status Badge */}
                <span
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${
                    plugin.installed
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-slate-200/60 dark:bg-slate-700/50 text-slate-500'
                  }`}
                >
                  {plugin.installed ? '已启用' : '未安装'}
                </span>
              </div>

              {/* Description */}
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4 line-clamp-2">
                {plugin.description}
              </p>

              {/* Permissions list preview */}
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-4">
                <Shield size={12} className="shrink-0 text-slate-400" />
                <span className="truncate">
                  所需权限: {plugin.permissions.join(' · ')}
                </span>
              </div>
            </div>

            {/* Actions Bottom Bar */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200/40 dark:border-white/10 text-xs">
              <div className="flex items-center gap-2">
                {/* Launch tool button (if installed and built-in) */}
                {plugin.installed && plugin.isBuiltInTool && plugin.toolType && (
                  <button
                    onClick={() => onLaunchTool(plugin.toolType!)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600 transition-colors shadow-2xs"
                  >
                    <Play size={12} />
                    <span>启动</span>
                  </button>
                )}

                {/* Pin to desktop toggle */}
                {plugin.installed && (
                  <button
                    onClick={() => onTogglePin(plugin.id)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl transition-colors ${
                      plugin.pinnedToDesktop
                        ? 'bg-sky-500/10 text-sky-600 dark:text-sky-300'
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                    }`}
                    title={plugin.pinnedToDesktop ? '从桌面移除' : '固定到桌面首页'}
                  >
                    {plugin.pinnedToDesktop ? <PinOff size={13} /> : <Pin size={13} />}
                    <span>{plugin.pinnedToDesktop ? '已固定' : '固定桌面'}</span>
                  </button>
                )}

                {/* Info / Usage instructions modal opener */}
                <button
                  onClick={() => setInfoModalPlugin(plugin)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  title="查看说明"
                >
                  <HelpCircle size={15} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                {/* GitHub link */}
                <a
                  href={plugin.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1"
                  title="查看源码"
                >
                  <Github size={14} />
                </a>

                {/* Install / Uninstall button */}
                <button
                  onClick={() => handleInstallClick(plugin)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl font-medium transition-colors ${
                    plugin.installed
                      ? 'text-rose-500 hover:bg-rose-500/10'
                      : 'bg-black/5 dark:bg-white/10 hover:bg-black/10 text-slate-700 dark:text-slate-200 border border-black/5 dark:border-white/10'
                  }`}
                >
                  {plugin.installed ? (
                    <>
                      <Trash2 size={13} />
                      <span>卸载</span>
                    </>
                  ) : (
                    <>
                      <Download size={13} />
                      <span>安装插件</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Permissions confirmation modal */}
      {selectedPluginForPerms && (
        <Modal
          isOpen={Boolean(selectedPluginForPerms)}
          onClose={() => setSelectedPluginForPerms(null)}
          maxWidth="md"
          title={`安装插件: ${selectedPluginForPerms.name}`}
        >
          <div className="space-y-4 pt-1">
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-sky-500/10 text-sky-700 dark:text-sky-300 text-xs">
              <Shield size={20} className="shrink-0 text-sky-500" />
              <span>
                为确保安全，记个球对所有扩展实行权限最小化原则。请确认是否授予以下权限：
              </span>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                申请权限列表：
              </h4>
              <ul className="space-y-1.5">
                {selectedPluginForPerms.permissions.map((perm, idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 p-2 rounded-xl bg-black/5 dark:bg-white/5"
                  >
                    <Check size={14} className="text-emerald-500 shrink-0" />
                    <span>{perm}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="text-[11px] text-slate-400">
              开源代码地址：
              <a
                href={selectedPluginForPerms.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-500 hover:underline ml-1"
              >
                {selectedPluginForPerms.githubUrl}
              </a>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200/50 dark:border-white/10 text-xs">
              <button
                onClick={() => setSelectedPluginForPerms(null)}
                className="px-3.5 py-2 rounded-xl text-slate-500 hover:bg-black/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmInstall}
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-medium transition-colors shadow-sm"
              >
                授权并安装
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Info & usage modal */}
      {infoModalPlugin && (
        <Modal
          isOpen={Boolean(infoModalPlugin)}
          onClose={() => setInfoModalPlugin(null)}
          maxWidth="md"
          title={`插件使用指南: ${infoModalPlugin.name}`}
        >
          <div className="space-y-4 pt-1 text-xs text-slate-600 dark:text-slate-300">
            <div>
              <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">
                功能简介
              </h4>
              <p className="leading-relaxed">{infoModalPlugin.description}</p>
            </div>

            <div>
              <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">
                使用指南
              </h4>
              <p className="leading-relaxed bg-black/5 dark:bg-white/5 p-3 rounded-2xl">
                {infoModalPlugin.instructions}
              </p>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-200/50 dark:border-white/10">
              <span className="text-slate-400 text-[11px]">
                最后更新：{infoModalPlugin.updatedAt}
              </span>
              <a
                href={`${infoModalPlugin.githubUrl}/issues`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-500 hover:underline text-xs flex items-center gap-1"
              >
                <span>报告问题或反馈</span>
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
