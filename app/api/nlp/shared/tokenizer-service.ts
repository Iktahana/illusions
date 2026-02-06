/**
 * Tokenizer Service for Next.js API Routes
 * 
 * Singleton service that manages kuromoji tokenizer initialization
 * for server-side tokenization in Web mode.
 */

import kuromoji from 'kuromoji';
import type { Token } from '@/lib/nlp-client/types';

class TokenizerService {
  private tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures> | null = null;
  private initPromise: Promise<void> | null = null;
  private isReady = false;

  /**
   * Initialize kuromoji tokenizer
   * 
   * Uses dictionary files from public/dict directory
   */
  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }
    
    console.log('[TokenizerService] Initializing kuromoji for Web API...');
    
    this.initPromise = new Promise((resolve, reject) => {
      // Use public directory for dictionary files
      const dicPath = process.cwd() + '/public/dict';
      
      kuromoji.builder({ dicPath }).build((err, tokenizer) => {
        if (err) {
          console.error('[TokenizerService] Init error:', err);
          this.initPromise = null;
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
   * @param text - Text to tokenize
   * @returns Token array
   */
  async tokenize(text: string): Promise<Token[]> {
    if (!this.isReady) {
      await this.init();
    }
    
    if (!this.tokenizer) {
      throw new Error('Tokenizer not initialized');
    }
    
    const rawTokens = this.tokenizer.tokenize(text);
    
    return rawTokens.map(t => ({
      surface: t.surface_form,
      pos: t.pos as Token['pos'],
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
}

// Singleton instance (one per Next.js worker process)
export const tokenizerService = new TokenizerService();
