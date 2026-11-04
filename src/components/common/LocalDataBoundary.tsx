import { Component, type ReactNode } from 'react';
import { Download, RotateCw } from 'lucide-react';
import { downloadRawLocalBackup } from '../../services/local-backup';

export class LocalDataBoundary extends Component<{ children: ReactNode }, { failed: boolean; backupFailed: boolean }> {
  state = { failed: false, backupFailed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="flex min-h-dvh items-center justify-center bg-zinc-100 p-5 text-zinc-900">
      <section className="w-full max-w-lg space-y-4">
        <h1 className="text-xl font-semibold">记个球</h1>
        <p role="alert" className="text-sm font-medium">本机数据暂时无法读取，或桌面加载出现异常。</p>
        <p className="text-sm leading-relaxed text-zinc-600">请先备份原始数据，再刷新重试。不要清除浏览器站点数据。</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-sky-700 px-3 text-sm text-white"
            onClick={() => {
              try {
                downloadRawLocalBackup('jigeqiu-local-data-backup.json');
                this.setState({ backupFailed: false });
              } catch { this.setState({ backupFailed: true }); }
            }}><Download size={16} />下载原始数据备份</button>
          <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm"
            onClick={() => window.location.reload()}><RotateCw size={16} />刷新重试</button>
        </div>
        {this.state.backupFailed && <p role="alert" className="text-sm text-rose-700">浏览器未允许读取或下载备份。请保持现有站点数据，检查浏览器权限。</p>}
      </section>
    </main>;
  }
}
