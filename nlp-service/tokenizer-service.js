/**
 * Tokenizer Service for Electron Main Process
 * 
 * Singleton service that manages kuromoji tokenizer initialization
 * and provides tokenization methods for IPC handlers.
 */

const kuromoji = require('kuromoji');
const path = require('path');

class TokenizerService {
  constructor() {
    this.tokenizer = null;
    this.initPromise = null;
    this.isReady = false;
    this.kuromojiModule = null;
  }

  /**
   * Get default dictionary path
   * Works in both dev and bundled (esbuild) environments
   * 
   * @returns {string} Dictionary path
   */
  _getDefaultDicPath() {
    // In bundled environment, kuromoji is in dist-main/node_modules/kuromoji
    // In dev environment, kuromoji is in node_modules/kuromoji
    // We use require.resolve to find kuromoji's location dynamically
    try {
      // require.resolve('kuromoji') returns <kuromoji-root>/src/kuromoji.js
      // We need to go up to <kuromoji-root> then add /dict
      const kuromojiPath = require.resolve('kuromoji');
      const kuromojiSrcDir = path.dirname(kuromojiPath); // <kuromoji-root>/src
      const kuromojiRoot = path.dirname(kuromojiSrcDir); // <kuromoji-root>
      const dicPath = path.join(kuromojiRoot, 'dict');
      console.log('[TokenizerService] Resolved dictionary path:', dicPath);
      return dicPath;
    } catch (error) {
      console.error('[TokenizerService] Failed to resolve kuromoji path:', error);
      // Fallback to /dict
      return '/dict';
    }
  }

  /**
   * Initialize kuromoji tokenizer
   * 
   * @param {string} dicPath - Dictionary directory path (default: auto-detected)
   * @returns {Promise<void>}
   */
  async init(dicPath) {
    // Prevent duplicate initialization
    if (this.initPromise) {
      return this.initPromise;
    }
    
    // Use provided path or auto-detect
    const resolvedDicPath = dicPath || this._getDefaultDicPath();
    
    console.log('[TokenizerService] Initializing with dicPath:', resolvedDicPath);
    
    this.initPromise = new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath: resolvedDicPath }).build((err, tokenizer) => {
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
    // Calculate character positions manually since kuromoji's word_position is byte-based
    let charPosition = 0;
    return rawTokens.map(t => {
      const token = {
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
        start: charPosition,
        end: charPosition + t.surface_form.length,
      };
      charPosition += t.surface_form.length;
      return token;
    });
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
