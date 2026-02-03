/**
 * Electron Tokenizer - kuromoji を Electron (Node.js) 環境で使用
 * Electron では Node.js の zlib を使えるので、ローカルの辞書ファイルを使用可能
 */

import kuromoji from 'kuromoji';
import type { Token } from './types';

class ElectronTokenizer {
  private tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures> | null = null;
  private initPromise: Promise<void> | null = null;
  private isReady = false;

  /**
   * トークナイザーを初期化する
   * Electron では dicPath をローカルパスに設定可能
   */
  async init(dicPath: string = '/dict'): Promise<void> {
    // 重複初期化を防ぐ
    if (this.initPromise) return this.initPromise;
    
    console.log('[ElectronTokenizer] Initializing with dicPath:', dicPath);
    
    this.initPromise = new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath }).build((err, tokenizer) => {
        if (err) {
          console.error('[ElectronTokenizer] Initialization error:', err);
          reject(err);
        } else {
          this.tokenizer = tokenizer;
          this.isReady = true;
          console.log('[ElectronTokenizer] Initialized successfully');
          resolve();
        }
      });
    });
    
    return this.initPromise;
  }

  /**
   * テキストをトークン化する
   * 初期化が完了していない場合は自動的に待機する
   */
  async tokenize(text: string): Promise<Token[]> {
    // 初期化が完了していない場合は待機
    if (!this.isReady) {
      if (this.initPromise) {
        await this.initPromise;
      } else {
        // init() がまだ呼ばれていない場合は自動初期化
        await this.init();
      }
    }
    
    if (!this.tokenizer) {
      throw new Error('Tokenizer initialization failed.');
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
export const electronTokenizer = new ElectronTokenizer();
