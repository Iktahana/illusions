/**
 * NLP IPC Adapter for Electron Main Process
 *
 * Thin adapter that registers IPC handlers and delegates
 * all processing to the shared NlpProcessor backend.
 *
 * Handlers:
 * - nlp:init - Initialize tokenizer
 * - nlp:tokenize-paragraph - Single paragraph tokenization
 * - nlp:tokenize-document - Batch document tokenization
 * - nlp:analyze-word-frequency - Word frequency analysis
 */

const { ipcMain } = require('electron');
const path = require('path');
const { nlpProcessor } = require('../../lib/nlp-backend/nlp-processor');

/**
 * Get default dictionary path for Electron environment.
 * Works in both dev and bundled (esbuild) environments.
 *
 * @returns {string} Dictionary path
 */
function getDefaultDicPath() {
  try {
    // require.resolve('kuromoji') returns <kuromoji-root>/src/kuromoji.js
    const kuromojiPath = require.resolve('kuromoji');
    const kuromojiSrcDir = path.dirname(kuromojiPath);
    const kuromojiRoot = path.dirname(kuromojiSrcDir);
    const dicPath = path.join(kuromojiRoot, 'dict');
    return dicPath;
  } catch (error) {
    console.error('[NLP IPC] Failed to resolve kuromoji path:', error);
    return '/dict';
  }
}

/**
 * Ensure the NLP processor is initialized (auto-init with Electron dict path)
 */
async function ensureInitialized() {
  if (!nlpProcessor.isInitialized()) {
    await nlpProcessor.init(getDefaultDicPath());
  }
}

/**
 * Register all NLP-related IPC handlers
 */
function registerNlpHandlers() {

  /**
   * Initialize NLP service
   * Handler: nlp:init
   */
  ipcMain.handle('nlp:init', async () => {
    try {
      const resolvedPath = getDefaultDicPath();
      await nlpProcessor.init(resolvedPath);
      return { success: true };
    } catch (error) {
      console.error('[NLP IPC] Init error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Tokenize single paragraph
   * Handler: nlp:tokenize-paragraph
   */
  ipcMain.handle('nlp:tokenize-paragraph', async (event, text) => {
    try {
      if (typeof text !== 'string' || text.length === 0 || text.length > 1_000_000) {
        throw new Error('Invalid text parameter');
      }
      await ensureInitialized();

      const tokens = await nlpProcessor.tokenize(text);

      return tokens;
    } catch (error) {
      console.error('[NLP IPC] Tokenize paragraph error:', error);
      throw error;
    }
  });

  /**
   * Tokenize document in batch
   * Handler: nlp:tokenize-document
   */
  ipcMain.handle('nlp:tokenize-document', async (event, request) => {
    try {
      const { paragraphs } = request;

      if (!Array.isArray(paragraphs) || paragraphs.length > 10_000) {
        throw new Error('Invalid paragraphs parameter');
      }
      for (const p of paragraphs) {
        if (typeof p?.text !== 'string' || typeof p?.pos !== 'number') {
          throw new Error('Invalid paragraph structure');
        }
      }

      await ensureInitialized();

      // Process paragraphs with IPC progress reporting
      const results = [];
      const total = paragraphs.length;

      for (let i = 0; i < total; i++) {
        const { pos, text } = paragraphs[i];
        const tokens = await nlpProcessor.tokenize(text);
        results.push({ pos, tokens });

        // Send progress event every 10 paragraphs
        if ((i + 1) % 10 === 0 || i === total - 1) {
          event.sender.send('nlp:tokenize-progress', {
            completed: i + 1,
            total: total,
            percentage: Math.round(((i + 1) / total) * 100)
          });
        }
      }

      return results;
    } catch (error) {
      console.error('[NLP IPC] Tokenize document error:', error);
      throw error;
    }
  });

  /**
   * Analyze word frequency
   * Handler: nlp:analyze-word-frequency
   */
  ipcMain.handle('nlp:analyze-word-frequency', async (event, text) => {
    try {
      if (typeof text !== 'string' || text.length === 0 || text.length > 10_000_000) {
        throw new Error('Invalid text parameter');
      }
      await ensureInitialized();
      const result = await nlpProcessor.analyzeWordFrequency(text);
      return result.words;
    } catch (error) {
      console.error('[NLP IPC] Analyze frequency error:', error);
      throw error;
    }
  });

}

module.exports = { registerNlpHandlers };
