/**
 * Tokenizer Service for Electron Main Process
 * 
 * Singleton service that manages kuromoji tokenizer initialization
 * and provides tokenization methods for IPC handlers.
 */

const kuromoji = require('kuromoji');

class TokenizerService {
  constructor() {
    this.tokenizer = null;
    this.initPromise = null;
    this.isReady = false;
    this.kuromojiModule = null;
  }

  /**
   * Initialize kuromoji tokenizer
   * 
   * @param {string} dicPath - Dictionary directory path (default: '/dict')
   * @returns {Promise<void>}
   */
  async init(dicPath = '/dict') {
    // Prevent duplicate initialization
    if (this.initPromise) {
      return this.initPromise;
    }
    
    console.log('[TokenizerService] Initializing with dicPath:', dicPath);
    
    this.initPromise = new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath }).build((err, tokenizer) => {
        if (err) {
          console.error('[TokenizerService] Initialization error:', err);
          this.initPromise = null; // Reset on failure
          reject(err);
        } else {
          this.tokenizer = tokenizer;
          this.isReady = true;
          console.log('[TokenizerService] Initialized successfully');
          resolve();
        }
      });
    });
    
    return this.initPromise;
  }

  /**
   * Tokenize text into morphemes
   * 
   * @param {string} text - Text to tokenize
   * @returns {Promise<Array<Object>>} Token array
   */
  async tokenize(text) {
    // Auto-initialize if not ready
    if (!this.isReady) {
      if (this.initPromise) {
        await this.initPromise;
      } else {
        await this.init();
      }
    }
    
    if (!this.tokenizer) {
      throw new Error('Tokenizer initialization failed');
    }
    
    const rawTokens = this.tokenizer.tokenize(text);
    
    // Convert to standardized format
    return rawTokens.map(t => ({
      surface: t.surface_form,
      pos: t.pos,
      pos_detail_1: t.pos_detail_1,
      pos_detail_2: t.pos_detail_2,
      pos_detail_3: t.pos_detail_3,
      conjugation_type: t.conjugated_type,
      conjugation_form: t.conjugated_form,
      basic_form: t.basic_form,
      reading: t.reading,
      pronunciation: t.pronunciation,
      start: t.word_position,
      end: t.word_position + t.surface_form.length,
    }));
  }

  /**
   * Batch tokenize multiple texts
   * 
   * @param {Array<string>} texts - Array of texts to tokenize
   * @returns {Promise<Array<Array<Object>>>} Array of token arrays
   */
  async tokenizeBatch(texts) {
    const results = [];
    for (const text of texts) {
      const tokens = await this.tokenize(text);
      results.push(tokens);
    }
    return results;
  }

  /**
   * Destroy tokenizer and reset state
   */
  destroy() {
    this.tokenizer = null;
    this.isReady = false;
    this.initPromise = null;
  }
}

// Export singleton instance
module.exports = new TokenizerService();
