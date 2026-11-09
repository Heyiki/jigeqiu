import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { normalizeBookmarkUrl } from './bookmark-input';

type Dependencies = { fetch?: typeof fetch; timeoutMs?: number };
const MAX_BYTES = 256 * 1024;
export function extractBookmarkTitle(html: string): string | undefined {
  let title = '';
  let ogTitle = '';
  let site = '';
  const stack: DefaultTreeAdapterMap['node'][] = [parse(html)];
  while (stack.length) {
    const node = stack.pop()!;
    if ('tagName' in node && node.namespaceURI === 'http://www.w3.org/1999/xhtml') {
      const attr = (name: string) => node.attrs.find(item => item.name === name)?.value ?? '';
      if (node.tagName === 'title' && !title) {
        title = node.childNodes.map(child => 'value' in child ? child.value : '').join('').trim();
      }
      if (node.tagName === 'meta') {
        const property = (attr('property') || attr('name')).toLowerCase();
        if (property === 'og:title' && !ogTitle) ogTitle = attr('content').trim();
        if (property === 'og:site_name' && !site) site = attr('content').trim();
      }
    }
    // Template fragments and foreign content cannot supply page metadata.
    if ('childNodes' in node && (!('namespaceURI' in node) || node.namespaceURI === 'http://www.w3.org/1999/xhtml')) {
      for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push(node.childNodes[i]);
    }
  }
  return site || title || ogTitle || undefined;
}

export async function fetchBookmarkTitle(
  input: string, signal: AbortSignal, deps: Dependencies = {},
): Promise<string | undefined> {
  if (signal.aborted) return;
  let page: URL;
  try { page = new URL(normalizeBookmarkUrl(input)); } catch { return; }
  page.hash = '';
  const controller = new AbortController();
  let finish!: (value: undefined) => void;
  const cancelled = new Promise<undefined>(resolve => { finish = resolve; });
  const abort = () => { controller.abort(); finish(undefined); };
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, deps.timeoutMs ?? 4000);
  const request = async () => {
    const response = await (deps.fetch ?? globalThis.fetch)(page.href, {
      mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (controller.signal.aborted || !response.ok || response.type === 'opaque' ||
        !/^text\/html(?:;|$)/i.test(contentType) ||
        Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) {
      void response.body?.cancel().catch(() => {});
      return;
    }
    const reader = response.body.getReader();
    const cancelReader = () => { void reader.cancel().catch(() => {}); };
    controller.signal.addEventListener('abort', cancelReader, { once: true });
    let bytes = 0;
    let text = '';
    const charset = /charset=["']?([^;"'\s]+)/i.exec(contentType)?.[1] ?? 'utf-8';
    try {
      const decoder = new TextDecoder(charset);
      while (!controller.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) { cancelReader(); return; }
        text += decoder.decode(value, { stream: true });
      }
      if (!controller.signal.aborted) return extractBookmarkTitle(text + decoder.decode());
    } finally {
      cancelReader();
      controller.signal.removeEventListener('abort', cancelReader);
      reader.releaseLock();
    }
  };
  try { return await Promise.race([request(), cancelled]); }
  catch { return; }
  finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}
