import assert from 'node:assert/strict';
import test from 'node:test';
import { probeLink, networkTarget, grantedOrigin } from '../../src/services/link-health/probe';
import { LinkHealthController } from '../../src/services/link-health/controller';

const sleep = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean) {
  for (let i = 0; i < 3000 && !check(); i++) await sleep(2);
  assert.ok(check(), 'condition completed within deadline');
}
const allowed = { contains: async () => true };

test('unsupported and unauthorized targets never send a network request', async () => {
  let calls = 0;
  const transport = async () => { calls++; return new Response(); };
  for (const url of ['javascript:alert(1)', 'file:///tmp/a', 'https://user:pass@example.org/', 'invalid']) {
    assert.equal((await probeLink(url, { ...allowed, fetch: transport })).reason, 'unsupported');
  }
  assert.equal((await probeLink('https://example.org/', { contains: async () => false, fetch: transport })).reason, 'permission');
  assert.equal(calls, 0);
  assert.deepEqual(networkTarget('http://example.org/a?q=1#route'), {
    url: 'http://example.org/a?q=1', origin: 'http://example.org', permission: 'http://example.org/*',
  });
  assert.equal(grantedOrigin('https://sub.example.org/*', ['https://*.example.org/*']), true);
  assert.equal(grantedOrigin('http://example.org/*', ['https://*/*']), false);
  assert.equal(grantedOrigin('https://example.org/*', ['https://evil-example.org/*']), false);
});

test('HEAD fallback verifies GET, preserves privacy and distinguishes anomalies', async () => {
  const requests: RequestInit[] = [];
  const success = await probeLink('https://example.org/', { ...allowed, fetch: async (_url, init) => {
    requests.push(init!);
    return new Response(null, { status: init!.method === 'HEAD' ? 405 : 200 });
  } });
  assert.equal(success.category, 'success');
  assert.deepEqual(requests.map(value => value.method), ['HEAD', 'GET']);
  for (const init of requests) {
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.referrerPolicy, 'no-referrer');
    assert.equal(init.cache, 'no-store');
  }
  for (const [status, category] of [[404, 'missing'], [410, 'missing'], [403, 'restricted'], [412, 'restricted'], [429, 'temporary'], [503, 'temporary']] as const) {
    const result = await probeLink('https://example.org/', { ...allowed, fetch: async () => new Response(null, { status }) });
    assert.equal(result.category, category);
    assert.equal(result.status, status);
  }
});

test('redirects cannot escape permission boundary and timeout differs from cancellation', async () => {
  const visited: string[] = [];
  const redirect = await probeLink('https://example.org/', {
    contains: async origin => origin === 'https://example.org/*',
    fetch: async url => {
      visited.push(String(url));
      return new Response(null, { status: 302, headers: { location: 'https://elsewhere.org/' } });
    },
  });
  assert.equal(redirect.reason, 'permission');
  assert.deepEqual(visited, ['https://example.org/']);
  const opaque = await probeLink('https://example.org/', { ...allowed,
    fetch: async () => ({ type: 'opaqueredirect', status: 0, body: null } as Response),
  });
  assert.equal(opaque.reason, 'redirect');
  const pending: typeof fetch = (_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
  });
  assert.equal((await probeLink('https://example.org/', { ...allowed, fetch: pending, timeoutMs: 5 })).reason, 'timeout');
  const abort = new AbortController();
  const request = probeLink('https://example.org/', { ...allowed, fetch: pending, signal: abort.signal });
  abort.abort();
  await assert.rejects(request, { name: 'AbortError' });
});

test('queue bounds concurrency, deduplicates fragments, and only exposes anomalies', async () => {
  let active = 0, maxActive = 0, calls = 0;
  const perOrigin = new Map<string, number>();
  const controller = new LinkHealthController(async (url, signal) => {
    const origin = new URL(url).origin;
    calls++;
    active++;
    maxActive = Math.max(active, maxActive);
    perOrigin.set(origin, (perOrigin.get(origin) ?? 0) + 1);
    assert.ok(perOrigin.get(origin)! <= 2);
    await sleep(3);
    signal.throwIfAborted();
    active--;
    perOrigin.set(origin, perOrigin.get(origin)! - 1);
    return { category: url.includes('bad') ? 'missing' : 'success', reason: 'http', status: url.includes('bad') ? 404 : 200 };
  });
  const entries = Array.from({ length: 40 }, (_, i) => ({ id: String(i), title: String(i), url: `https://s${i % 8}.test/${i % 2 ? 'bad' : 'ok'}/${i}#route` }));
  entries.push({ ...entries[0], id: 'copy-ok', url: entries[0].url.replace('#route', '#other') });
  entries.push({ ...entries[1], id: 'copy-bad', url: entries[1].url.replace('#route', '#other') });
  await controller.start(entries);
  await until(() => controller.getSnapshot().state === 'completed');
  assert.equal(calls, 40);
  assert.ok(maxActive <= 6);
  assert.equal(controller.getSnapshot().completed, 42);
  assert.equal(controller.getSnapshot().success, 21);
  assert.equal(controller.results().total, 21);
  assert.ok(controller.results().items.every(row => row.category === 'missing'));
  controller.stop();
});

test('offline failures wait for resume rather than becoming false anomalies', async () => {
  let release: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const controller = new LinkHealthController(async () => {
    calls++;
    if (calls === 1) { await gate; return { category: 'temporary', reason: 'network' }; }
    return { category: 'success', reason: 'http', status: 200 };
  });
  await controller.start([{ id: 'offline', title: 'offline', url: 'https://offline.test/' }]);
  await until(() => calls === 1);
  controller.setOffline(true);
  release!();
  await sleep(10);
  assert.equal(controller.results().total, 0);
  assert.equal(controller.getSnapshot().completed, 0);
  controller.setOffline(false);
  controller.resume();
  await until(() => controller.getSnapshot().state === 'completed');
  assert.equal(controller.getSnapshot().success, 1);
});

test('retry delays release origin slots and are bounded to one retry', async () => {
  let calls = 0;
  const controller = new LinkHealthController(async () => {
    calls++;
    return { category: 'temporary', reason: 'http', status: 429, retryDelayMs: 1000 };
  });
  await controller.start([{ id: 'retry', title: 'retry', url: 'https://retry.test/' }]);
  await until(() => controller.getSnapshot().state === 'completed');
  assert.equal(calls, 2);
  assert.equal(controller.results().items[0].status, 429);
  assert.equal(controller.getSnapshot().completed, 1);
});

test('pause, resume, stop and restart prevent old callbacks from corrupting a new scan', async () => {
  let release: () => void;
  let oldStarted = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const controller = new LinkHealthController(async url => {
    if (url.includes('old')) { oldStarted = true; await gate; }
    return { category: 'missing', reason: 'http', status: 404 };
  });
  await controller.start([{ id: 'old', title: 'old', url: 'https://old.test/' }]);
  await until(() => oldStarted);
  controller.pause();
  assert.equal(controller.getSnapshot().state, 'paused');
  controller.resume();
  controller.stop();
  await controller.start([{ id: 'new', title: 'new', url: 'https://new.test/' }]);
  release!();
  await sleep(5);
  await until(() => controller.getSnapshot().state === 'completed');
  assert.equal(controller.getSnapshot().completed, 1);
  assert.deepEqual(controller.results().items.map(row => row.bookmark.id), ['new']);
});

test('same-origin dispatch stays at two and paused queues dispatch no new jobs', async () => {
  let active = 0, maxActive = 0, calls = 0;
  const controller = new LinkHealthController(async () => {
    calls++; active++; maxActive = Math.max(maxActive, active);
    await sleep(5);
    active--;
    return { category: 'success', reason: 'http', status: 200 };
  });
  await controller.start(Array.from({ length: 12 }, (_, i) => ({ id: String(i), title: String(i), url: `https://one.test/${i}` })));
  await until(() => calls >= 2);
  controller.pause();
  await sleep(15);
  assert.equal(calls, 2, 'pause lets in-flight requests finish but dispatches no more');
  controller.resume();
  await until(() => controller.getSnapshot().state === 'completed');
  assert.equal(calls, 12);
  assert.equal(maxActive, 2);
});

test('50k inputs yield to the event loop, use bounded notifications and paginate anomalies', async () => {
  let ticks = 0, notifications = 0;
  const ticker = setInterval(() => { ticks++; }, 0);
  const controller = new LinkHealthController(async () => ({ category: 'missing', reason: 'http', status: 404 }));
  const unsubscribe = controller.subscribe(() => { notifications++; });
  try {
    await controller.start(Array.from({ length: 50_000 }, (_, i) => ({
      id: String(i), title: `Item ${i}`, url: `https://bulk.test/${i}`,
    })));
    await until(() => controller.getSnapshot().state === 'completed');
    assert.equal(controller.results().total, 50_000);
    assert.equal(controller.results({ page: 2, pageSize: 50 }).items.length, 50);
    assert.equal(controller.results({ query: 'Item 49999' }).total, 1);
    assert.ok(ticks > 5, 'preparation and dispatch let input/timers run');
    assert.ok(notifications < 100, 'no per-result render notifications');
  } finally { clearInterval(ticker); unsubscribe(); controller.stop(); }
});

test('recheck success removes an anomaly; stale entries cannot be selected for trash', async () => {
  let healthy = false;
  const controller = new LinkHealthController(async () => ({ category: healthy ? 'success' : 'missing', reason: 'http', status: healthy ? 200 : 404 }));
  const bookmark = { id: 'a', title: 'A', url: 'https://a.test/' };
  await controller.start([bookmark]);
  await until(() => controller.getSnapshot().state === 'completed');
  assert.equal(controller.trashCandidates(['a'], [{ ...bookmark, url: 'https://changed.test/' }]).length, 0);
  assert.equal(controller.trashCandidates(['a'], [bookmark]).length, 1);
  healthy = true;
  await controller.recheck(['a']);
  await until(() => controller.getSnapshot().state === 'completed');
  assert.equal(controller.results().total, 0);
  assert.equal(controller.getSnapshot().success, 1);
});
