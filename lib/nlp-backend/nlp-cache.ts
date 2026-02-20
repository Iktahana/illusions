/**
 * NLP-specific LRU Cache for tokenization results
 *
 * Thin wrapper around the generic LruCache, using Node crypto MD5
 * for key hashing. Used by NlpProcessor to cache tokenization results.
 */

import crypto from 'crypto';
import type { Token } from '../nlp-client/types';
import { LruCache } from '../lru-cache';

const md5Hash = (text: string): string =>
  crypto.createHash('md5').update(text).digest('hex');

export class NlpCache extends LruCache<Token[]> {
  constructor(maxSize: number = 1000) {
    super(md5Hash, maxSize);
  }
}
