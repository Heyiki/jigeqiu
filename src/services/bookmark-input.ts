import type { SiteIconMode } from '../types';

export function normalizeBookmarkUrl(input: string): string {
  const value = input.trim();
  if (!value) throw new Error('请输入网址');
  if (/^(javascript|data|file|vbscript|about|mailto|tel):/i.test(value)
    || (/^[a-z][a-z\d+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value))) {
    throw new Error('仅支持 HTTP 或 HTTPS 网页地址');
  }
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); }
  catch { throw new Error('请输入有效的网页地址'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('请输入有效的网页地址');
  return url.href;
}

export function parseBookmarkKeywords(input: string): string[] {
  const seen = new Set<string>();
  return input.split(/[,，\n]+/).map(word => word.trim()).filter(word => {
    if (!word || seen.has(word.toLocaleLowerCase())) return false;
    seen.add(word.toLocaleLowerCase());
    return true;
  });
}

export function bookmarkSaveError(cause: unknown): string {
  if (cause instanceof DOMException && cause.name === 'QuotaExceededError') return '浏览器存储空间不足，未保存。请释放空间后重试。';
  const message = cause instanceof Error ? cause.message : '';
  if (message === 'CONFLICT') return '收藏已在其他页面变化，请保留输入并刷新后重试。';
  if (message === 'DUPLICATE') return '收藏库中已有此网址，请打开或编辑已有收藏。';
  if (message === 'COMMIT_UNCERTAIN') return '保存结果无法确认，请刷新检查，不要清空浏览器数据。';
  if (message === 'INVALID_ICON') return '图标链接无效，请使用不含账号密码的 HTTP(S) 图片地址。';
  return '保存失败，请检查网址与文件夹后重试。输入已保留。';
}
export function normalizeBookmarkIcon(icon?: string, iconMode?: SiteIconMode): { icon?: string; iconMode?: SiteIconMode } {
  if (iconMode && !['auto', 'custom', 'text'].includes(iconMode)) throw new Error('INVALID_ICON');
  if (iconMode === 'text') return { icon: undefined, iconMode };
  if (!icon) return { icon: undefined, iconMode };
  if (icon.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(icon)) throw new Error('INVALID_ICON');
  let url: URL;
  try { url = new URL(icon); } catch { throw new Error('INVALID_ICON'); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error('INVALID_ICON');
  return { icon: url.href, iconMode };
}
