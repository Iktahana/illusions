/**
 * Tokenizer Client - Worker との通信を管理
 */

import type { Token, WorkerMessage, WorkerResponse } from './types';

type PendingRequest = {
  resolve: (value: Token[] | 'ready') => void;
  reject: (reason: string) => void;
};

/**
 * トークナイザークライアント（シングルトン）
 */
class TokenizerClient {
  private worker: Worker | null = null;
  private pending = new Map<number, PendingRequest>();
  private messageId = 0;
  private initPromise: Promise<void> | null = null;
  private isReady = false;

  /**
   * トークナイザーを初期化する
   * 
   * @param dicPath 辞書ファイルのパス（デフォルト: '/dict'）
   */
  async init(dicPath: string = '/dict'): Promise<void> {
    // 重複初期化を防ぐ
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = new Promise((resolve, reject) => {
      try {
        // Worker を動的に作成
        this.worker = new Worker(
          new URL('./tokenizer-worker.ts', import.meta.url),
          { type: 'module' }
        );
        
        // Worker からのメッセージを処理
        this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
          this.handleMessage(e.data);
        };
        
        // Worker のエラーをハンドル
        this.worker.onerror = (err) => {
          console.error('[TokenizerClient] Worker error:', err);
          reject(err.message || 'Worker initialization failed');
        };
        
        // 初期化リクエストを送信
        const id = ++this.messageId;
        this.pending.set(id, {
          resolve: () => {
            this.isReady = true;
            resolve();
          },
          reject,
        });
        
        const msg: WorkerMessage = {
          type: 'init',
          id,
          payload: { dicPath },
        };
        this.worker.postMessage(msg);
      } catch (err) {
        reject(err instanceof Error ? err.message : 'Failed to create worker');
      }
    });
    
    return this.initPromise;
  }

  /**
   * テキストをトークン化する
   * 
   * @param text 解析対象のテキスト
   * @returns トークン配列
   */
  async tokenize(text: string): Promise<Token[]> {
    if (!this.isReady || !this.worker) {
      throw new Error('Tokenizer not initialized. Call init() first.');
    }
    
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      this.pending.set(id, { 
        resolve: resolve as (v: Token[] | 'ready') => void, 
        reject 
      });
      
      const msg: WorkerMessage = {
        type: 'tokenize',
        id,
        payload: { text },
      };
      this.worker!.postMessage(msg);
    });
  }

  /**
   * Worker からのメッセージを処理
   */
  private handleMessage(data: WorkerResponse) {
    const { id, result, error } = data;
    const request = this.pending.get(id);
    
    if (!request) return;
    this.pending.delete(id);
    
    if (error) {
      request.reject(error);
    } else if (result) {
      request.resolve(result);
    }
  }

  /**
   * Worker を破棄
   */
  destroy() {
    this.worker?.terminate();
    this.worker = null;
    this.isReady = false;
    this.initPromise = null;
    this.pending.clear();
  }
}

// シングルトンインスタンスをエクスポート
export const tokenizerClient = new TokenizerClient();
