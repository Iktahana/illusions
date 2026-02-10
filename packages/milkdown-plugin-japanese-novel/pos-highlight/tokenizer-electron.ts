/**
 * Electron Tokenizer - kuromoji を Electron (Node.js) 環境で使用
 * Electron では Node.js の zlib を使えるので、ローカルの辞書ファイルを使用可能
 */

import type { Token, InitProgressCallback } from './types';
import type kuromoji from 'kuromoji';

class ElectronTokenizer {
  private tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures> | null = null;
  private initPromise: Promise<void> | null = null;
  private isReady = false;
  private kuromojiModule: typeof kuromoji | null = null;

  /**
   * トークナイザーを初期化する
   * Electron では dicPath をローカルパスに設定可能
   */
  async init(dicPath: string = '/dict', callback?: InitProgressCallback): Promise<void> {
    // 重複初期化を防ぐ
    if (this.initPromise) {
      // 既に初期化中または完了している場合
      if (this.isReady) {
        callback?.onComplete?.();
      }
      return this.initPromise;
    }
    
    console.log('[ElectronTokenizer] Initializing with dicPath:', dicPath);
    
    this.initPromise = (async () => {
      try {
        // ステップ 1: kuromoji モジュールを読み込む（20%）
        callback?.onProgress?.(20, 'kuromoji モジュールを読み込み中...');
        
        if (!this.kuromojiModule) {
          this.kuromojiModule = (await import('kuromoji')).default;
        }
        
        // ステップ 2: 辞書を読み込む（50%）
        callback?.onProgress?.(50, 'ローカル辞書を読み込み中...');
        
        return new Promise<void>((resolve, reject) => {
          this.kuromojiModule!.builder({ dicPath }).build((err, tokenizer) => {
            if (err) {
              console.error('[ElectronTokenizer] Initialization error:', err);
              callback?.onError?.(err);
              reject(err);
            } else {
              this.tokenizer = tokenizer;
              this.isReady = true;
              
              // ステップ 3: 完了（100%）
              callback?.onProgress?.(100, '初期化完了！');
              callback?.onComplete?.();
              
              console.log('[ElectronTokenizer] Initialized successfully');
              resolve();
            }
          });
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        callback?.onError?.(err);
        this.initPromise = null; // 失敗時はリセット
        throw error;
      }
    })();
    
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
    // kuromoji の word_position はバイト位置なので、文字位置を手動で計算する
    let charPosition = 0;
    const tokens: Token[] = rawTokens.map(t => {
      const token: Token = {
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
        start: charPosition,
        end: charPosition + t.surface_form.length,
      };
      charPosition += t.surface_form.length;
      return token;
    });

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
