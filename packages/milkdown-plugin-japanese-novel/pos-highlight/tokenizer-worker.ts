/**
 * Web Worker - kuromoji による形態素解析
 * 独立したスレッドで動作し、UIスレッドをブロックしない
 */

import type { Token, WorkerMessage, WorkerResponse } from './types';
import type kuromoji from 'kuromoji';

let tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures> | null = null;

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, payload, id } = e.data;
  
  if (type === 'init') {
    // トークナイザーを初期化
    const dicPath = payload.dicPath || '/dict';
    
    try {
      // Dynamically import kuromoji to avoid server-side rendering issues
      const kuromojiModule = (await import('kuromoji')).default;
      
      kuromojiModule.builder({ dicPath }).build((err, t) => {
        if (err) {
          const response: WorkerResponse = { 
            id, 
            error: `Failed to initialize tokenizer: ${err.message || JSON.stringify(err)}` 
          };
          self.postMessage(response);
        } else {
          tokenizer = t;
          const response: WorkerResponse = { id, result: 'ready' };
          self.postMessage(response);
        }
      });
    } catch (error) {
      const response: WorkerResponse = { 
        id, 
        error: `Worker initialization error: ${error instanceof Error ? error.message : JSON.stringify(error)}`
      };
      self.postMessage(response);
    }
    return;
  }
  
  if (type === 'tokenize') {
    if (!tokenizer) {
      const response: WorkerResponse = { 
        id, 
        error: 'Tokenizer not initialized. Call init first.' 
      };
      self.postMessage(response);
      return;
    }
    
    const text = payload.text || '';
    
    try {
      const rawTokens = tokenizer.tokenize(text);
      
      // 必要なフィールドだけを抽出して転送データ量を削減
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
      
      const response: WorkerResponse = { id, result: tokens };
      self.postMessage(response);
    } catch (error) {
      const response: WorkerResponse = { 
        id, 
        error: error instanceof Error ? error.message : 'Unknown tokenization error'
      };
      self.postMessage(response);
    }
  }
};
