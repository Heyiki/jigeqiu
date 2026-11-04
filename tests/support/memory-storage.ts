interface StorageOptions {
  maxBytes?: number;
}

/** Test-only Storage boundary; it never touches a browser profile. */
export class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();
  private readonly maxBytes: number;
  failReads = false;
  failWrites = false;

  constructor(options: StorageOptions = {}) {
    this.maxBytes = options.maxBytes ?? Number.POSITIVE_INFINITY;
  }

  get length(): number {
    return this.entries.size;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    if (this.failReads) {
      throw new DOMException('Storage reads denied by test', 'SecurityError');
    }
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.assertWritable();
    const next = new Map(this.entries);
    next.set(key, value);
    const bytes = [...next].reduce((total, [name, content]) => total + 2 * (name.length + content.length), 0);
    if (bytes > this.maxBytes) {
      throw new DOMException('Test storage quota exceeded', 'QuotaExceededError');
    }
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.assertWritable();
    this.entries.delete(key);
  }

  clear(): void {
    this.assertWritable();
    this.entries.clear();
  }

  private assertWritable(): void {
    if (this.failWrites) {
      throw new DOMException('Storage writes denied by test', 'SecurityError');
    }
  }
}
