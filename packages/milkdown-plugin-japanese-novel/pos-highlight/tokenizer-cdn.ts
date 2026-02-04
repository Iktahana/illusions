/**
 * CDN-based Tokenizer - kuromoji をブラウザビルドから使用
 */

import type { Token, InitProgressCallback } from './types';

// グローバルな kuromoji の型定義
declare global {
  interface Window {
    kuromoji?: {
      builder: (config: { dicPath: string }) => {
        build: (callback: (err: Error | null, tokenizer: any) => void) => void;
      };
    };
  }
}

class CDNTokenizer {
  private tokenizer: any = null;
  private initPromise: Promise<void> | null = null;
  private isReady = false;
  private scriptLoaded = false;
  private progressCallback: InitProgressCallback | null = null;

  /**
   * CDN から kuromoji スクリプトを読み込む
   */
  private async loadScript(): Promise<void> {
    if (this.scriptLoaded) return;
    
    return new Promise((resolve, reject) => {
      // すでにグローバルに存在する場合
      if (typeof window !== 'undefined' && window.kuromoji) {
        this.scriptLoaded = true;
        resolve();
        return;
      }

      // スクリプトタグを動的に追加
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js';
      script.onload = () => {
        this.scriptLoaded = true;
        resolve();
      };
      script.onerror = () => {
        reject(new Error('Failed to load kuromoji from CDN'));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * トークナイザーを初期化する
   * ブラウザでは CDN の辞書を使用する
   */
  async init(_dicPath?: string, callback?: InitProgressCallback): Promise<void> {
    // 重複初期化を防ぐ
    if (this.initPromise) {
      // 既に初期化中または完了している場合
      if (this.isReady) {
        callback?.onComplete?.();
      }
      return this.initPromise;
    }
    
    // コールバックを保存
    this.progressCallback = callback || null;
    
    // CDN の辞書パスを使用（ローカルの gzip ファイルはブラウザで解凍できない）
    const cdnDicPath = 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict';
    
    console.log('[CDNTokenizer] Using CDN dictionary:', cdnDicPath);
    
    this.initPromise = (async () => {
      try {
        // ステップ 1: スクリプトを読み込む（5%）
        this.progressCallback?.onProgress?.(5, 'kuromoji スクリプトを読み込み中...');
        await this.loadScript();
        
        // ステップ 2: 辞書をダウンロード＆パース（10% -> 95%）
        this.progressCallback?.onProgress?.(10, '辞書ファイルをダウンロード中...');
        
        // kuromoji を初期化（辞書ダウンロードを含む）
        await new Promise<void>((resolve, reject) => {
          if (!window.kuromoji) {
            const error = new Error('kuromoji not available after script load');
            this.progressCallback?.onError?.(error);
            reject(error);
            return;
          }

          // kuromoji.build() の内部では複数の辞書ファイルをダウンロードする
          // 進捗を段階的に更新（推定）
          let currentProgress = 10;
          const progressInterval = setInterval(() => {
            if (currentProgress < 90) {
              currentProgress += 5;
              this.progressCallback?.onProgress?.(currentProgress, '辞書ファイルを処理中...');
            }
          }, 300); // 300ms ごとに進捗更新

          window.kuromoji.builder({ dicPath: cdnDicPath }).build((err, tokenizer) => {
            clearInterval(progressInterval);
            
            if (err) {
              console.error('[CDNTokenizer] Initialization error:', err);
              this.progressCallback?.onError?.(err);
              reject(err);
            } else {
              this.tokenizer = tokenizer;
              this.isReady = true;
              
              // ステップ 3: 完了（100%）
              this.progressCallback?.onProgress?.(100, '初期化完了！');
              this.progressCallback?.onComplete?.();
              
              console.log('[CDNTokenizer] Initialized successfully');
              resolve();
            }
          });
        });
      } catch (error) {
        console.error('[CDNTokenizer] Failed to initialize:', error);
        const err = error instanceof Error ? error : new Error(String(error));
        this.progressCallback?.onError?.(err);
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
    
    // Debug: 最初の数トークンの生データを確認
    if (rawTokens.length > 0) {
      console.log('[CDNTokenizer] Raw tokens sample:', rawTokens.slice(0, 5).map((t: any) => ({
        surface: t.surface_form,
        pos: t.word_position,
        len: t.surface_form.length,
      })));
    }
    
    // 必要なフィールドだけを抽出
    // kuromoji の word_position は 1 始まりなので、0 始まりに変換
    const tokens: Token[] = rawTokens.map((t: any) => ({
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
      start: t.word_position - 1,  // 1始まり → 0始まり
      end: t.word_position - 1 + t.surface_form.length,
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
export const cdnTokenizer = new CDNTokenizer();
