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
      // Move to end (LRU: most recently used)
      this.cache.delete(key);
      this.cache.set(key, cached);
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
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}
