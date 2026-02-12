/**
 * Frontend LRU Cache for NLP Results
 * 
 * Reduces redundant IPC/API calls by caching tokenization results.
 * Uses MD5 hash of text as cache key.
 */

import CryptoJS from 'crypto-js';
import type { Token } from './types';

class NlpCache {
  private cache: Map<string, Token[]> = new Map();
  private readonly maxSize: number;
  private hitCount: number = 0;
  private missCount: number = 0;

  constructor(maxSize: number = 500) {
    this.maxSize = maxSize;
  }

  /**
   * Generate MD5 hash of text for cache key
   */
  private hashText(text: string): string {
    return CryptoJS.MD5(text).toString();
  }

  /**
   * Get cached tokens for text
   *
   * @param text - Text to lookup
   * @returns Cached tokens or undefined if not found
   */
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

  /**
   * Store tokens in cache
   * 
   * @param text - Original text
   * @param tokens - Tokenization result
   */
  set(text: string, tokens: Token[]): void {
    const key = this.hashText(text);
    
    // LRU eviction: remove oldest entry if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, tokens);
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  /**
   * Get cache statistics
   */
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

// Singleton instance
export const nlpCache = new NlpCache();
