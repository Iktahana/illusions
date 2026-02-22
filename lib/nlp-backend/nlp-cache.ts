/**
 * NLP-specific LRU Cache for tokenization results
 *
 * Extends the unified LRUCache with MD5 hashing and statistics tracking.
 * Used by NlpProcessor to cache tokenization results.
 */

import crypto from 'crypto';
import type { Token } from '../nlp-client/types';
import { LRUCache } from '../utils/lru-cache';

const md5Hash = (text: string): string =>
  crypto.createHash('md5').update(text).digest('hex');

export class NlpCache extends LRUCache<string, Token[]> {
  constructor(maxSize: number = 1000) {
    super(maxSize, { hashFn: md5Hash, trackStats: true });
  }
}
