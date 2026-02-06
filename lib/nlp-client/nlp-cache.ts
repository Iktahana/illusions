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
      // Move to end (LRU: most recently used)
      this.cache.delete(key);
      this.cache.set(key, cached);
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
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // TODO: Track hit/miss counts
    };
  }
}

// Singleton instance
export const nlpCache = new NlpCache();
