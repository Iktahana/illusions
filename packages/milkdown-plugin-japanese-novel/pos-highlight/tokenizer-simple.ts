/**
 * Simple Tokenizer - kuromoji を主スレッドで使用（Worker なし）
 * シンプルな実装で、まず動作することを優先
 */

import type { Token } from './types';
import type kuromoji from 'kuromoji';

class SimpleTokenizer {
  private tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures> | null = null;
  private initPromise: Promise<void> | null = null;
  private isReady = false;
  private kuromojiModule: typeof kuromoji | null = null;

  /**
   * トークナイザーを初期化する
   */
  async init(dicPath: string = '/dict'): Promise<void> {
    // 重複初期化を防ぐ
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = (async () => {
      // Dynamically import kuromoji to avoid server-side rendering issues
      if (!this.kuromojiModule) {
        this.kuromojiModule = (await import('kuromoji')).default;
      }
      
      return new Promise<void>((resolve, reject) => {
        this.kuromojiModule!.builder({ dicPath }).build((err, tokenizer) => {
          if (err) {
            console.error('[SimpleTokenizer] Initialization error:', err);
            reject(err);
          } else {
            this.tokenizer = tokenizer;
            this.isReady = true;
            console.log('[SimpleTokenizer] Initialized successfully');
            resolve();
          }
        });
      });
    })();
    
    return this.initPromise;
  }

  /**
   * テキストをトークン化する
   */
  async tokenize(text: string): Promise<Token[]> {
    if (!this.isReady || !this.tokenizer) {
      throw new Error('Tokenizer not initialized. Call init() first.');
    }
    
    const rawTokens = this.tokenizer.tokenize(text);
    
    // 必要なフィールドだけを抽出
    const tokens: Token[] = rawTokens.map(t => ({
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
    
    return tokens;
  }

  /**
   * トークナイザーを破棄
   */
  destroy() {
    this.tokenizer = null;
    this.isReady = false;
    this.initPromise = null;
  }
}

// シングルトンインスタンスをエクスポート
export const simpleTokenizer = new SimpleTokenizer();
