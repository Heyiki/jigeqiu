import type { Bookmark } from '../../types';
import { networkTarget, type HealthCategory, type ProbeResult } from './probe';

export type ScanBookmark = Pick<Bookmark, 'id' | 'url' | 'title' | 'folderId'>;
export type ScanState = 'idle' | 'preparing' | 'running' | 'paused' | 'completed' | 'stopped';
export interface HealthRow extends ProbeResult { bookmark: ScanBookmark; checkedAt: number }
export interface ScanSnapshot {
  state: ScanState; total: number; completed: number; success: number; anomalies: number;
  requests: number; revision: number; offline: boolean;
}
type Probe = (url: string, signal: AbortSignal) => Promise<ProbeResult>;
interface Job { url: string; entries: ScanBookmark[]; attempt: number; readyAt: number }
interface Bucket { jobs: Job[]; cursor: number; active: number }
const yieldTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** Owned by an extension document, never persisted or hosted by a service worker. */
export class LinkHealthController {
  private snapshot: ScanSnapshot = { state: 'idle', total: 0, completed: 0, success: 0, anomalies: 0, requests: 0, revision: 0, offline: false };
  private listeners = new Set<() => void>();
  private anomalies = new Map<string, HealthRow>();
  private buckets: Bucket[] = [];
  private cursor = 0;
  private active = 0;
  private remaining = 0;
  private generation = 0;
  private abort = new AbortController();
  private notifyTimer?: ReturnType<typeof setTimeout>;
  private pumpTimer?: ReturnType<typeof setTimeout>;
  private rechecking = false;
  private dispatches = 0;
  private terminalState: 'completed' | 'stopped' = 'completed';
  private filterCache?: { revision: number; category: string; query: string; rows: HealthRow[] };

  constructor(private probe: Probe) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(immediate = false) {
    if (immediate) {
      clearTimeout(this.notifyTimer);
      this.notifyTimer = undefined;
      this.snapshot = { ...this.snapshot, anomalies: this.anomalies.size, revision: this.snapshot.revision + 1 };
      for (const listener of this.listeners) listener();
    } else if (!this.notifyTimer) this.notifyTimer = setTimeout(() => { this.publish(true); }, 300);
  }

  async start(entries: ScanBookmark[]) { return this.begin(entries, false); }
  private async begin(entries: ScanBookmark[], rechecking: boolean) {
    this.cancel();
    const generation = this.generation;
    this.abort = new AbortController();
    this.rechecking = rechecking;
    if (!rechecking) {
      this.anomalies.clear();
      this.snapshot = { state: 'preparing', total: entries.length, completed: 0, success: 0, anomalies: 0, requests: 0, revision: this.snapshot.revision, offline: false };
    } else this.snapshot = { ...this.snapshot, state: 'preparing' };
    this.filterCache = undefined;
    this.publish(true);
    const groups = new Map<string, Job>();
    const origins = new Map<string, Bucket>();
    for (let i = 0; i < entries.length; i++) {
      if (i % 500 === 0) {
        await yieldTask();
        if (generation !== this.generation) return;
      }
      const bookmark = { ...entries[i] };
      const target = networkTarget(bookmark.url);
      const key = target?.url ?? bookmark.url;
      let job = groups.get(key);
      if (!job) {
        job = { url: key, entries: [], attempt: 0, readyAt: 0 };
        groups.set(key, job);
        const origin = target?.origin ?? 'unsupported';
        let bucket = origins.get(origin);
        if (!bucket) { bucket = { jobs: [], cursor: 0, active: 0 }; origins.set(origin, bucket); }
        bucket.jobs.push(job);
      }
      job.entries.push(bookmark);
    }
    if (generation !== this.generation) return;
    this.buckets = [...origins.values()];
    this.remaining = groups.size;
    this.snapshot = { ...this.snapshot, state: this.snapshot.offline ? 'paused' : 'running' };
    this.publish(true);
    this.schedule();
  }

  private schedule(delay = 0) {
    if (this.pumpTimer || this.snapshot.state !== 'running') return;
    this.pumpTimer = setTimeout(() => { this.pumpTimer = undefined; this.pump(); }, delay);
  }
  private pump() {
    if (this.snapshot.state !== 'running') return;
    if (!this.remaining && !this.active) {
      this.buckets = [];
      this.snapshot = { ...this.snapshot, state: this.rechecking ? this.terminalState : 'completed' };
      this.publish(true);
      return;
    }
    let inspected = 0;
    while (this.active < 6 && inspected < this.buckets.length) {
      const index = this.cursor++ % this.buckets.length;
      const bucket = this.buckets[index];
      inspected++;
      const job = bucket.jobs[bucket.cursor];
      if (!job && !bucket.active) {
        const last = this.buckets.pop()!;
        if (index < this.buckets.length) this.buckets[index] = last;
        inspected = 0;
        continue;
      }
      if (!job || bucket.active >= 2 || job.readyAt > Date.now()) continue;
      bucket.cursor++;
      bucket.active++;
      this.active++;
      const generation = this.generation;
      const signal = this.abort.signal;
      this.snapshot = { ...this.snapshot, requests: this.snapshot.requests + 1 };
      void this.probe(job.url, signal).then(result => {
        if (generation !== this.generation) return;
        // Retry one transient failure without keeping a concurrency slot occupied.
        if (result.category === 'temporary' && this.snapshot.offline) {
          job.readyAt = 0;
          bucket.jobs.push(job);
        } else if (result.category === 'temporary' && !job.attempt && (result.retryDelayMs ?? Infinity) <= 30_000) {
          job.attempt++;
          job.readyAt = Date.now() + Math.max(1000, result.retryDelayMs ?? 1000);
          bucket.jobs.push(job);
        } else {
          this.remaining--;
          this.record(job, result);
          // Release completed bookmark references, including successful entries.
          job.entries = [];
        }
      }).catch(() => {
        if (generation !== this.generation || signal.aborted) return;
        this.remaining--;
        this.record(job, { category: 'temporary', reason: 'network' });
        job.entries = [];
      }).finally(() => {
        if (generation !== this.generation) return;
        bucket.active--;
        this.active--;
        this.publish();
        // Bound microtask chains even when a fake or cached transport resolves immediately.
        if (++this.dispatches % 100 === 0 || this.pumpTimer) this.schedule();
        else this.pump();
      });
      inspected = 0;
    }
    if (!this.active && this.remaining) this.schedule(100);
  }

  private record(job: Job, result: ProbeResult) {
    let successes = 0;
    for (const bookmark of job.entries) {
      if (result.category === 'success') { this.anomalies.delete(bookmark.id); successes++; }
      else this.anomalies.set(bookmark.id, { ...result, bookmark, checkedAt: Date.now() });
    }
    this.snapshot = { ...this.snapshot,
      completed: this.snapshot.completed + (this.rechecking ? 0 : job.entries.length),
      success: this.snapshot.success + successes,
    };
    this.filterCache = undefined;
  }

  pause() {
    if (this.snapshot.state !== 'running') return;
    this.snapshot = { ...this.snapshot, state: 'paused' };
    this.publish(true);
  }
  resume() {
    if (this.snapshot.state !== 'paused' || this.snapshot.offline) return;
    this.snapshot = { ...this.snapshot, state: 'running' };
    this.publish(true);
    this.schedule();
  }
  setOffline(offline: boolean) {
    this.snapshot = { ...this.snapshot, offline };
    if (offline && this.snapshot.state === 'running') this.pause();
    else this.publish(true);
  }
  private cancel() {
    this.generation++;
    this.abort.abort();
    clearTimeout(this.pumpTimer);
    clearTimeout(this.notifyTimer);
    this.pumpTimer = this.notifyTimer = undefined;
    this.buckets = [];
    this.active = this.remaining = this.cursor = 0;
  }
  stop() {
    this.cancel();
    if (['running', 'paused', 'preparing'].includes(this.snapshot.state)) {
      this.snapshot = { ...this.snapshot, state: 'stopped' };
      this.publish(true);
    }
  }
  ignore(ids: string[]) {
    for (const id of ids) this.anomalies.delete(id);
    this.filterCache = undefined;
    this.publish(true);
  }
  async recheck(ids: string[]) {
    if (!['completed', 'stopped'].includes(this.snapshot.state)) return;
    const entries = ids.flatMap(id => { const row = this.anomalies.get(id); return row ? [row.bookmark] : []; });
    this.terminalState = this.snapshot.state === 'stopped' ? 'stopped' : 'completed';
    await this.begin(entries, true);
    // Callers observe completion through the same subscription as a full scan.
  }
  trashCandidates(ids: string[], current: ScanBookmark[]): ScanBookmark[] {
    const byId = new Map(current.map(bookmark => [bookmark.id, bookmark]));
    return ids.flatMap(id => {
      const row = this.anomalies.get(id);
      return row && byId.get(id)?.url === row.bookmark.url ? [byId.get(id)!] : [];
    });
  }
  results(options: { category?: Exclude<HealthCategory, 'success'> | 'all'; query?: string; page?: number; pageSize?: number } = {}) {
    const category = options.category ?? 'all';
    const query = (options.query ?? '').trim().toLocaleLowerCase();
    let rows: HealthRow[];
    if (this.filterCache?.revision === this.snapshot.revision && this.filterCache.category === category && this.filterCache.query === query) rows = this.filterCache.rows;
    else {
      rows = [...this.anomalies.values()].filter(row => (category === 'all' || row.category === category)
        && (!query || row.bookmark.title.toLocaleLowerCase().includes(query) || row.bookmark.url.toLocaleLowerCase().includes(query)));
      this.filterCache = { revision: this.snapshot.revision, category, query, rows };
    }
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 50));
    const page = Math.min(Math.max(1, options.page ?? 1), Math.max(1, Math.ceil(rows.length / pageSize)));
    return { total: rows.length, page, items: rows.slice((page - 1) * pageSize, page * pageSize) };
  }
}
