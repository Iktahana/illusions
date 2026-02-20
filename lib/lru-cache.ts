/**
 * Generic LRU Cache with pluggable hash function
 *
 * Provides a Map-based LRU cache where the least-recently-used
 * entries are evicted when the cache reaches its maximum size.
 * The hash function is injected at construction time, allowing
 * different environments to use different hashing strategies.
 */

/**
 * Hash function type: converts an input string to a cache key string
 */
export type HashFunction = (input: string) => string;

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

export class LruCache<T> {
  private cache: Map<string, T> = new Map();
  private readonly maxSize: number;
  private readonly hashFn: HashFunction;
  private hitCount: number = 0;
  private missCount: number = 0;

  constructor(hashFn: HashFunction, maxSize: number = 1000) {
    this.hashFn = hashFn;
    this.maxSize = maxSize;
  }

  /**
   * Look up a value by its raw input key.
   *
   * @param input - The raw string to look up (will be hashed internally)
   * @returns The cached value, or undefined on cache miss
   */
  get(input: string): T | undefined {
    const key = this.hashFn(input);
    const cached = this.cache.get(key);

    if (cached !== undefined) {
      this.hitCount++;
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, cached);
    } else {
      this.missCount++;
    }

    return cached;
  }

  /**
   * Store a value in the cache.
   *
   * If the cache is at capacity and the key is new, the least-recently-used
   * entry is evicted first.
   *
   * @param input - The raw string key (will be hashed internally)
   * @param value - The value to cache
   */
  set(input: string, value: T): void {
    const key = this.hashFn(input);

    // LRU eviction: remove oldest entry if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, value);
  }

  /**
   * Clear all cached entries and reset statistics.
   */
  clear(): void {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  /**
   * Get a snapshot of cache statistics.
   */
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

  /**
   * Get cache hit count
   */
  getHitCount(): number {
    return this.hitCount;
  }

  /**
   * Get cache miss count
   */
  getMissCount(): number {
    return this.missCount;
  }

  /**
   * Get cache hit rate as percentage (0-100)
   */
  getHitRate(): number {
    const totalAccesses = this.hitCount + this.missCount;
    return totalAccesses > 0 ? (this.hitCount / totalAccesses) * 100 : 0;
  }

  /**
   * Get cache miss rate as percentage (0-100)
   */
  getMissRate(): number {
    const totalAccesses = this.hitCount + this.missCount;
    return totalAccesses > 0 ? (this.missCount / totalAccesses) * 100 : 0;
  }
}
