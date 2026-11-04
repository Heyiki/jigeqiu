export const WALLPAPER_MAX_BYTES = 10 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateWallpaper(file: Pick<File, 'type' | 'size'>): void {
  if (!TYPES.has(file.type)) throw new Error('WALLPAPER_FORMAT');
  if (!file.size || file.size > WALLPAPER_MAX_BYTES) throw new Error('WALLPAPER_SIZE');
}

export function visibleWallpaper(preset: string): 'cyan-lake' | 'snow-mountain' {
  return preset === 'snow-mountain' ? preset : 'cyan-lake';
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('WALLPAPER_STORAGE'));
    };
    const timer = setTimeout(fail, 5000);
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open('jigeqiu-wallpapers-v1', 1);
    } catch {
      fail();
      return;
    }
    request.onupgradeneeded = () => request.result.createObjectStore('images');
    request.onerror = request.onblocked = fail;
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true;
      clearTimeout(timer);
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

async function transaction<T>(
  mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('images', mode);
      const request = operation(tx.objectStore('images'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('WALLPAPER_STORAGE'));
    });
  } finally {
    db.close();
  }
}

export async function saveWallpaper(file: File): Promise<string> {
  validateWallpaper(file);
  const image = await createImageBitmap(file);
  try {
    if (!image.width || !image.height || image.width * image.height > 40_000_000) {
      throw new Error('WALLPAPER_DIMENSIONS');
    }
  } finally {
    image.close();
  }
  const id = crypto.randomUUID();
  await transaction('readwrite', store => store.put(file, id));
  return id;
}

export async function readWallpaper(id: string): Promise<Blob | undefined> {
  const value: unknown = await transaction('readonly', store => store.get(id));
  return value instanceof Blob ? value : undefined;
}

export async function removeWallpaper(id: string): Promise<void> {
  await transaction('readwrite', store => store.delete(id));
}
