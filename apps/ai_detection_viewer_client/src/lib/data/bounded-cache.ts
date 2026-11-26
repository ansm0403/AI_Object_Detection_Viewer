/**
 * (F7) A small "keep the most recently used N" store.
 *
 * With hundreds of frames the app cannot keep every fetched point cloud and
 * photo in memory: ten frames of points and photos were ~25 MB after a little
 * use, and nothing was ever dropped (design doc F7 §2.2). This keeps the last
 * `limit` entries that were stored OR read, and drops the one unused for the
 * longest when a new one would exceed the limit. What is dropped is still in
 * the browser's HTTP cache, so reading it again costs a parse, not a download.
 *
 * Plain data structure — no React, no timers. A JavaScript `Map` remembers the
 * order in which keys were inserted, so "least recently used" is simply the
 * first key; touching an entry re-inserts it at the end.
 */
export class BoundedCache<K, V> {
  private readonly entries = new Map<K, V>();
  private readonly limit: number;

  /** `limit` below 1 (or not a number) is treated as 1: the store always holds the newest entry. */
  constructor(limit: number) {
    this.limit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 1;
  }

  /** The value for `key`, marking it as just used. `undefined` when absent. */
  get(key: K): V | undefined {
    if (!this.entries.has(key)) return undefined;
    const value = this.entries.get(key) as V;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  /** The value for `key` WITHOUT marking it as used (safe to call while rendering). */
  peek(key: K): V | undefined {
    return this.entries.get(key);
  }

  /** Whether `key` is stored. Does NOT count as a use. */
  has(key: K): boolean {
    return this.entries.has(key);
  }

  /**
   * Store `value` under `key` (replacing any earlier value) as the most recent
   * entry. Returns the keys that were dropped to stay within the limit.
   */
  set(key: K, value: V): K[] {
    this.entries.delete(key);
    this.entries.set(key, value);
    const dropped: K[] = [];
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value as K;
      this.entries.delete(oldest);
      dropped.push(oldest);
    }
    return dropped;
  }

  delete(key: K): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  /** Keys from least to most recently used. */
  keys(): K[] {
    return [...this.entries.keys()];
  }
}
