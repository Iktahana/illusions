/**
 * Server-side Cache for Web API Routes
 * 
 * LRU cache implementation for tokenization results.
 * Reduces redundant kuromoji processing in Next.js API routes.
 */

import crypto from 'crypto';
import type { Token } from '@/lib/nlp-client/types';

class ServerCache {
  private cache: Map<string, Token[]> = new Map();
  private readonly maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * Generate MD5 hash of text for cache key
   */
  private hashText(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  /**
   * Get cached tokens for text
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
    };
  }
}

// Singleton instance
export const serverCache = new ServerCache();
