/**
 * Shared LRU Cache for NLP Tokenization Results
 *
 * Used by NlpProcessor to cache tokenization results.
 * MD5-based key hashing with LRU eviction.
 */

import crypto from 'crypto';
import type { Token } from '../nlp-client/types';

export class NlpCache {
  private cache: Map<string, Token[]> = new Map();
  private readonly maxSize: number;
  private hitCount: number = 0;
  private missCount: number = 0;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  private hashText(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  get(text: string): Token[] | undefined {
    const key = this.hashText(text);
    const cached = this.cache.get(key);

    if (cached) {
      // Track cache hit
      this.hitCount++;
      // Move to end (LRU: most recently used)
      this.cache.delete(key);
      this.cache.set(key, cached);
    } else {
      // Track cache miss
      this.missCount++;
    }

    return cached;
  }

  set(text: string, tokens: Token[]): void {
    const key = this.hashText(text);

    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, tokens);
  }

  clear(): void {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  getStats() {
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
   * Get cache hit rate percentage
   */
  getHitRate(): number {
    const totalAccesses = this.hitCount + this.missCount;
    return totalAccesses > 0 ? (this.hitCount / totalAccesses) * 100 : 0;
  }

  /**
   * Get cache miss rate percentage
   */
  getMissRate(): number {
    const totalAccesses = this.hitCount + this.missCount;
    return totalAccesses > 0 ? (this.missCount / totalAccesses) * 100 : 0;
  }
}
