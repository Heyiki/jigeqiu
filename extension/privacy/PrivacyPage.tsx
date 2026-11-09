import { ArrowLeft, Check, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { privacySections, PRIVACY_VERSION } from './content';
import './privacy.css';

export function PrivacyPage({
  initial = false,
  onContinue,
}: {
  initial?: boolean;
  onContinue?: () => void;
}) {
  const [declined, setDeclined] = useState(false);
  const [error, setError] = useState('');
  return (
    <main className="extension-privacy-page">
      <header>
        <img src="brand/logo-a2-equator.png" width="48" height="48" alt="" />
        <div>
          <h1>记个球</h1>
          <p>Chrome / Edge 新标签页扩展</p>
        </div>
      </header>
      <h2>{initial ? '使用前的隐私告知' : '隐私说明'}</h2>
      <p className="privacy-version">告知版本：{PRIVACY_VERSION}</p>
      {initial ? (
        <>
          <ul className="privacy-summary">
            <li>收藏、设置及壁纸保存在当前浏览器，不提供云同步。</li>
            <li>
              扩展替换浏览器新标签页；网站图标沿用原有联网获取方式，不申请额外网站访问权限。
            </li>
            <li>
              远程图片、外部搜索、收藏链接及嵌入网页可能连接第三方网站，对方可能收到
              IP、搜索词或浏览器请求信息。
            </li>
            <li>
              新增收藏时，自动补全标题可能在保存前请求完整网址，包含路径和查询参数。
            </li>
          </ul>
          <p>
            这是应用内隐私告知，不会代替浏览器的权限授权。未确认前不会进入工作台。
          </p>
          <a href={`?privacy=1${location.hash}`}>完整隐私说明</a>
          {declined ? (
            <div className="privacy-declined">
              <p role="status">
                尚未进入工作台。你可以关闭本页，并在浏览器扩展管理页停用或移除记个球。
              </p>
              <button type="button" onClick={() => setDeclined(false)}>
                <ArrowLeft size={16} />
                返回隐私告知
              </button>
            </div>
          ) : (
            <div className="privacy-actions">
              <button type="button" onClick={() => setDeclined(true)}>
                暂不使用
              </button>
              <button
                type="button"
                className="privacy-primary"
                onClick={() => {
                  setError('');
                  try {
                    onContinue?.();
                  } catch {
                    setError(
                      '无法保存本地告知记录，未进入工作台。请检查浏览器存储权限后重试。',
                    );
                  }
                }}
              >
                <Check size={16} />
                知晓并继续
              </button>
            </div>
          )}
          {error && <p role="alert">{error}</p>}
        </>
      ) : (
        <>
          {privacySections.map((section) => (
            <section key={section.title}>
              <h3>{section.title}</h3>
              <p>{section.text}</p>
            </section>
          ))}
          <a className="privacy-return" href={`./index.html${location.hash}`}>
            <ArrowLeft size={16} />
            返回
          </a>
        </>
      )}
      <footer>
        <ShieldCheck size={16} />
        隐私说明随扩展提供，可离线查看。
      </footer>
    </main>
  );
}
