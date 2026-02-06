/**
 * Server-side NLP Cache for Electron Main Process
 * 
 * LRU cache implementation for tokenization results.
 * Reduces redundant kuromoji processing.
 */

const crypto = require('crypto');

class NlpCache {
  constructor(maxSize = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Generate MD5 hash of text for cache key
   * 
   * @param {string} text - Text to hash
   * @returns {string} MD5 hash
   */
  hashText(text) {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  /**
   * Get cached tokens for text
   * 
   * @param {string} text - Text to lookup
   * @returns {Array<Object>|undefined} Cached tokens or undefined
   */
  get(text) {
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
   * @param {string} text - Original text
   * @param {Array<Object>} tokens - Tokenization result
   */
  set(text, tokens) {
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
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * 
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

// Export singleton instance
module.exports = new NlpCache();
