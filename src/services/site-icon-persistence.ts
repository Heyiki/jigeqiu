import type { SiteIconPersistence, SiteIconRecord } from './site-icons';

const DATABASE = 'jigeqiu-site-icons-v1';
const STORE = 'icons';
const MAX_ENTRIES = 256;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 512 * 1024;
const TIMEOUT = 1500;

export function createSiteIconPersistence(factory?: IDBFactory): SiteIconPersistence {
  let connection: Promise<IDBDatabase> | undefined;
  function open() {
    return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => fail(new Error('Icon database open timed out')), TIMEOUT);
      function fail(error: Error) { settled = true; clearTimeout(timer); reject(error); }
      try {
        const idb = factory ?? globalThis.indexedDB;
        if (!idb) throw new Error('IndexedDB unavailable');
        const request = idb.open(DATABASE, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' });
        };
        request.onblocked = () => fail(new Error('Icon database blocked'));
        request.onerror = () => fail(request.error ?? new Error('Icon database unavailable'));
        request.onsuccess = () => {
          if (settled) { request.result.close(); return; }
          settled = true;
          clearTimeout(timer);
          const db = request.result;
          db.onversionchange = () => { db.close(); connection = undefined; };
          resolve(db);
        };
      } catch (error) { fail(error instanceof Error ? error : new Error('Icon database unavailable')); }
    });
  }
  async function transaction<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore, result: (value: T) => void) => void,
    signal?: AbortSignal,
  ): Promise<T> {
    const db = await open();
    if (signal?.aborted) throw new Error('Icon database transaction cancelled');
    return new Promise((resolve, reject) => {
      let result: T;
      const tx = db.transaction(STORE, mode);
      const abort = () => { try { tx.abort(); } catch { /* Already completed. */ } };
      signal?.addEventListener('abort', abort, { once: true });
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
      const timer = setTimeout(() => {
        abort();
        cleanup();
        reject(new Error('Icon database transaction timed out'));
      }, TIMEOUT);
      tx.oncomplete = () => { cleanup(); resolve(result); };
      tx.onabort = tx.onerror = () => {
        cleanup();
        reject(tx.error ?? new Error('Icon database transaction failed'));
      };
      try { run(tx.objectStore(STORE), value => { result = value; }); }
      catch (error) { cleanup(); abort(); reject(error); }
    });
  }
  return {
    read(key) {
      return transaction<SiteIconRecord | undefined>('readonly', (store, result) => {
        const request = store.get(key);
        request.onsuccess = () => result(request.result);
      });
    },
    write(record, signal) {
      if ((record.blob?.size ?? 0) > MAX_IMAGE_BYTES) return Promise.reject(new Error('Icon exceeds byte limit'));
      return transaction<void>('readwrite', store => {
        store.put(record);
        const request = store.getAll();
        request.onsuccess = () => {
          const records = (request.result as SiteIconRecord[]).sort((a, b) => a.accessedAt - b.accessedAt);
          let bytes = records.reduce((total, item) => total + (item.blob?.size ?? 0), 0);
          let count = records.length;
          for (const item of records) {
            if (count <= MAX_ENTRIES && bytes <= MAX_BYTES) break;
            store.delete(item.key);
            bytes -= item.blob?.size ?? 0;
            count--;
          }
        };
      }, signal);
    },
    clear() { return transaction<void>('readwrite', store => { store.clear(); }); },
  };
}
