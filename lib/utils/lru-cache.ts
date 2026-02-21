/**
 * Simple LRU (Least Recently Used) cache.
 *
 * Provides a Map-like interface with a configurable maximum size.
 * When the cache exceeds its capacity, the least-recently-used
 * entry is evicted.
 */
export class LRUCache<K, V> {
  private readonly maxSize: number;
  private readonly cache = new Map<K, V>();

  constructor(maxSize: number = 200) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  set(key: K, value: V): void {
    // If key already exists, delete first so it moves to the end
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, value);

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
  }

  get size(): number {
    return this.cache.size;
  }
}
