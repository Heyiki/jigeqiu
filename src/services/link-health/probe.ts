export type HealthCategory = 'success' | 'missing' | 'restricted' | 'temporary' | 'unchecked';
export type HealthReason = 'http' | 'unsupported' | 'permission' | 'timeout' | 'network' | 'redirect';
export interface ProbeResult {
  category: HealthCategory;
  reason: HealthReason;
  status?: number;
  retryDelayMs?: number;
}
export interface ProbeDependencies {
  contains(origin: string): Promise<boolean>;
  fetch: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export function networkTarget(input: string) {
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
    url.hash = '';
    return { url: url.href, origin: url.origin, permission: `${url.protocol}//${url.hostname}/*` };
  } catch { return; }
}

/** Host permissions ignore port and path; handle wildcard grants returned by getAll. */
export function grantedOrigin(origin: string, grants: string[]): boolean {
  return grants.some(grant => {
    if (grant === '<all_urls>') return true;
    const match = /^(\*|https?):\/\/([^/]+)\//.exec(grant);
    if (!match) return false;
    const url = new URL(origin);
    if (match[1] !== '*' && `${match[1]}:` !== url.protocol) return false;
    const host = match[2];
    return host === '*' || host === url.hostname || (host.startsWith('*.')
      && (url.hostname === host.slice(2) || url.hostname.endsWith(`.${host.slice(2)}`)));
  });
}

function httpResult(response: Response): ProbeResult {
  const status = response.status;
  const category: HealthCategory = response.ok ? 'success'
    : [404, 410].includes(status) ? 'missing'
    : [401, 403, 407, 412, 451].includes(status) ? 'restricted'
    : status === 408 || status === 429 || status >= 500 ? 'temporary' : 'unchecked';
  const after = response.headers.get('retry-after');
  const parsed = after === null ? 1000 : /^\d+$/.test(after.trim())
    ? Number(after) * 1000 : Date.parse(after) - Date.now();
  return { category, reason: 'http', status,
    ...(category === 'temporary' ? { retryDelayMs: Number.isFinite(parsed) ? Math.max(1000, parsed) : 1000 } : {}) };
}

export async function probeLink(input: string, deps: ProbeDependencies): Promise<ProbeResult> {
  const initial = networkTarget(input);
  if (!initial) return { category: 'unchecked', reason: 'unsupported' };
  const timeout = new AbortController();
  const signal = deps.signal ? AbortSignal.any([deps.signal, timeout.signal]) : timeout.signal;
  const timer = setTimeout(() => timeout.abort(), deps.timeoutMs ?? 10_000);
  try {
    let target = initial;
    let method = 'HEAD';
    const seen = new Set<string>();
    for (let hops = 0; hops <= 5;) {
      signal.throwIfAborted();
      if (!(await deps.contains(target.permission))) return { category: 'unchecked', reason: 'permission' };
      signal.throwIfAborted();
      const response = await deps.fetch(target.url, {
        method, signal, credentials: 'omit', redirect: 'manual', referrerPolicy: 'no-referrer', cache: 'no-store',
      });
      // Manual cross-origin redirects are commonly opaque in browser fetch.
      // Never follow a Location that we cannot observe and authorize ourselves.
      if (response.type === 'opaqueredirect' || response.status === 0) {
        await response.body?.cancel();
        return { category: 'unchecked', reason: 'redirect' };
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) return { category: 'unchecked', reason: 'redirect', status: response.status };
        const next = networkTarget(new URL(location, target.url).href);
        if (!next || seen.has(next.url) || hops === 5) return { category: 'unchecked', reason: 'redirect' };
        seen.add(target.url);
        target = next;
        hops++;
        continue;
      }
      const result = httpResult(response);
      await response.body?.cancel();
      if (method === 'HEAD' && [400, 401, 403, 404, 405, 410, 412, 501].includes(response.status)) {
        method = 'GET';
        continue;
      }
      return result;
    }
    return { category: 'unchecked', reason: 'redirect' };
  } catch {
    deps.signal?.throwIfAborted();
    return { category: 'temporary', reason: timeout.signal.aborted ? 'timeout' : 'network', retryDelayMs: 1000 };
  } finally { clearTimeout(timer); }
}
