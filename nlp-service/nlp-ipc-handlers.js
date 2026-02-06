/**
 * NLP IPC Handlers for Electron Main Process
 * 
 * Registers IPC handlers for:
 * - nlp:init - Initialize tokenizer
 * - nlp:tokenize-paragraph - Single paragraph tokenization
 * - nlp:tokenize-document - Batch document tokenization
 * - nlp:analyze-word-frequency - Word frequency analysis
 */

const { ipcMain } = require('electron');
const tokenizerService = require('./tokenizer-service');
const nlpCache = require('./nlp-cache');

// Excluded POS tags for frequency analysis
const EXCLUDED_POS = new Set(['助詞', '助動詞', '記号', 'フィラー', 'その他']);
const EXCLUDED_POS_DETAILS = new Set([
  '非自立', '接尾', '数', '代名詞', '句点', '読点', '空白', '括弧開', '括弧閉'
]);
const EXCLUDED_CHARS_PATTERN = /^[。、！？!?「」『』（）()【】［］\[\]・…―－ー〜～：；:;，,．.　\s]+$/;

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
      await tokenizerService.init(dicPath || '/dict');
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
      // Check cache first
      let tokens = nlpCache.get(text);
      
      if (!tokens) {
        // Tokenize and cache
        tokens = await tokenizerService.tokenize(text);
        nlpCache.set(text, tokens);
      }
      
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
      
      const results = [];
      const total = paragraphs.length;
      
      for (let i = 0; i < total; i++) {
        const { pos, text } = paragraphs[i];
        
        // Check cache
        let tokens = nlpCache.get(text);
        
        if (!tokens) {
          // Tokenize and cache
          tokens = await tokenizerService.tokenize(text);
          nlpCache.set(text, tokens);
        }
        
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
      // Tokenize text
      const tokens = await tokenizerService.tokenize(text);
      
      // Build frequency map
      const wordMap = new Map();
      
      for (const token of tokens) {
        // Filter excluded POS
        if (EXCLUDED_POS.has(token.pos)) continue;
        if (token.pos_detail_1 && EXCLUDED_POS_DETAILS.has(token.pos_detail_1)) continue;
        if (!token.surface.trim()) continue;
        if (EXCLUDED_CHARS_PATTERN.test(token.surface)) continue;
        
        // Use basic form as key (or surface if not available)
        const key = token.basic_form && token.basic_form !== '*' 
          ? token.basic_form 
          : token.surface;
        
        const existing = wordMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          wordMap.set(key, {
            word: key,
            reading: token.reading !== '*' ? token.reading : undefined,
            pos: token.pos,
            count: 1,
          });
        }
      }
      
      // Sort by count descending
      const words = Array.from(wordMap.values()).sort((a, b) => b.count - a.count);
      
      return words;
    } catch (error) {
      console.error('[NLP IPC] Analyze frequency error:', error);
      throw error;
    }
  });

  console.log('[NLP IPC] Handlers registered successfully');
}

module.exports = { registerNlpHandlers };
