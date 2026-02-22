/**
 * Unified LRU (Least Recently Used) cache.
 *
 * Provides a Map-like interface with a configurable maximum size.
 * When the cache exceeds its capacity, the least-recently-used
 * entry is evicted.
 *
 * Optional features:
 * - Custom hash function for key mapping (e.g. MD5 for string content)
 * - Hit/miss statistics tracking
 */

/**
 * Cache statistics snapshot
 */
export interface CacheStats {
  /** Current number of entries */
  size: number;
  /** Maximum number of entries before eviction */
  maxSize: number;
  /** Total cache hits */
  hitCount: number;
  /** Total cache misses */
  missCount: number;
  /** Total accesses (hits + misses) */
  totalAccesses: number;
  /** Hit rate as percentage (0-100) */
  hitRate: number;
  /** Miss rate as percentage (0-100) */
  missRate: number;
}

export interface LRUCacheOptions<K> {
  /** Custom hash function to convert keys to string cache keys */
  hashFn?: (key: K) => string;
  /** Enable hit/miss statistics tracking */
  trackStats?: boolean;
}

export class LRUCache<K, V> {
  private readonly maxSize: number;
  private readonly cache = new Map<string, V>();
  private readonly hashFn: ((key: K) => string) | null;
  private readonly trackStats: boolean;
  private hitCount = 0;
  private missCount = 0;

  constructor(maxSize: number = 200, options?: LRUCacheOptions<K>) {
    this.maxSize = maxSize;
    this.hashFn = options?.hashFn ?? null;
    this.trackStats = options?.trackStats ?? false;
  }

  private toKey(key: K): string {
    if (this.hashFn) return this.hashFn(key);
    // For primitive keys, use direct string conversion
    return key as unknown as string;
  }

  get(key: K): V | undefined {
    const k = this.toKey(key);
    const value = this.cache.get(k);
    if (value !== undefined) {
      if (this.trackStats) this.hitCount++;
      // Move to end (most recently used)
      this.cache.delete(k);
      this.cache.set(k, value);
    } else {
      if (this.trackStats) this.missCount++;
    }
    return value;
  }

  has(key: K): boolean {
    return this.cache.has(this.toKey(key));
  }

  set(key: K, value: V): void {
    const k = this.toKey(key);
    if (this.cache.has(k)) {
      this.cache.delete(k);
    }
    this.cache.set(k, value);

    // Evict oldest entry if over capacity
    if (this.cache.size > this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
  }

  clear(): void {
    this.cache.clear();
    if (this.trackStats) {
      this.hitCount = 0;
      this.missCount = 0;
    }
  }

  get size(): number {
    return this.cache.size;
  }

  getStats(): CacheStats {
    const totalAccesses = this.hitCount + this.missCount;
    const hitRate = totalAccesses > 0 ? (this.hitCount / totalAccesses) * 100 : 0;
    const missRate = totalAccesses > 0 ? (this.missCount / totalAccesses) * 100 : 0;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      totalAccesses,
      hitRate,
      missRate,
    };
  }
}
