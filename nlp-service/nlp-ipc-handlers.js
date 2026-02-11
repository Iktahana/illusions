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
const { nlpProcessor } = require('../lib/nlp-backend/nlp-processor');

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
    console.log('[NLP IPC] Resolved dictionary path:', dicPath);
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
  console.log('[NLP IPC] Registering handlers...');

  /**
   * Initialize NLP service
   * Handler: nlp:init
   */
  ipcMain.handle('nlp:init', async (event, dicPath) => {
    try {
      const resolvedPath = dicPath || getDefaultDicPath();
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
      await ensureInitialized();

      console.log('[NLP DEBUG] 🔵 分析前 - フロントエンドから受信:', {
        textLength: text.length,
        textPreview: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        fullText: text
      });

      const tokens = await nlpProcessor.tokenize(text);

      console.log('[NLP DEBUG] 🟢 分析後 - フロントエンドへ返す結果:', {
        tokensCount: tokens.length,
        tokens: tokens
      });

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

      if (!Array.isArray(paragraphs)) {
        throw new Error('Invalid paragraphs parameter');
      }

      await ensureInitialized();

      console.log('[NLP IPC] Tokenize document request:', {
        paragraphsCount: paragraphs.length,
        paragraphsPreview: paragraphs.slice(0, 3).map((p, i) => ({
          index: i,
          pos: p.pos,
          textLength: p.text.length,
          textPreview: p.text.substring(0, 50) + (p.text.length > 50 ? '...' : '')
        }))
      });

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

      console.log('[NLP IPC] Tokenize document response:', {
        resultsCount: results.length,
        totalTokens: results.reduce((sum, r) => sum + r.tokens.length, 0),
      });

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
      await ensureInitialized();
      const result = await nlpProcessor.analyzeWordFrequency(text);
      return result.words;
    } catch (error) {
      console.error('[NLP IPC] Analyze frequency error:', error);
      throw error;
    }
  });

  console.log('[NLP IPC] Handlers registered successfully');
}

module.exports = { registerNlpHandlers };
