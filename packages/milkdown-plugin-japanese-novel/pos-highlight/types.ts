/**
 * 品詞着色（Part-of-Speech Highlighting）の型定義
 */

/**
 * 品詞タイプ（kuromoji の品詞分類）
 */
export type PosType = 
  | '名詞' 
  | '動詞' 
  | '形容詞' 
  | '副詞' 
  | '助詞' 
  | '助動詞' 
  | '接続詞' 
  | '感動詞' 
  | '記号'
  | '連体詞'
  | 'フィラー'
  | 'その他';

/**
 * トークン（形態素解析結果）
 */
export interface Token {
  /** 表層形（実際の単語） */
  surface: string;
  /** 品詞 */
  pos: PosType;
  /** 品詞細分類1（自立/非自立など） */
  pos_detail_1?: string;
  /** 品詞細分類2 */
  pos_detail_2?: string;
  /** 品詞細分類3 */
  pos_detail_3?: string;
  /** 活用型（五段・一段など） */
  conjugation_type?: string;
  /** 活用形 */
  conjugation_form?: string;
  /** 基本形 */
  basic_form?: string;
  /** 読み */
  reading?: string;
  /** 発音 */
  pronunciation?: string;
  /** 開始位置 */
  start: number;
  /** 終了位置 */
  end: number;
}

/**
 * 品詞ごとの色設定
 */
export interface PosColorConfig {
  [key: string]: string;  // 品詞 -> 色（hex または CSS 変数）
}

/**
 * ユーザーの品詞着色設定
 */
export interface PosHighlightSettings {
  /** 有効/無効 */
  enabled: boolean;
  /** 品詞ごとの色設定 */
  colors: PosColorConfig;
}

/**
 * トークン結合オプション
 */
export interface TokenMergeOptions {
  /** 助詞を結合 */
  mergeParticles: boolean;
  /** 動詞+助動詞を結合 */
  mergeVerbAuxiliary: boolean;
  /** 形容詞+助動詞を結合 */
  mergeAdjectiveAux: boolean;
  /** 副詞+助詞を結合 */
  mergeAdverbParticle: boolean;
  /** 名詞+接尾詞を結合 */
  mergeNounSuffix: boolean;
  /** 助詞連鎖の最大長 */
  maxParticleChain: number;
  /** 助動詞連鎖の最大長 */
  maxAuxiliaryChain: number;
}

/**
 * トークン化プリセット
 */
export type TokenizePreset = 'fine' | 'medium' | 'coarse' | 'custom';

/**
 * Worker へ送るメッセージ
 */
export interface WorkerMessage {
  /** メッセージタイプ */
  type: 'init' | 'tokenize';
  /** メッセージID（レスポンスの照合用） */
  id: number;
  /** ペイロード */
  payload: {
    /** 辞書パス（初期化時） */
    dicPath?: string;
    /** 解析対象テキスト（トークン化時） */
    text?: string;
  };
}

/**
 * Worker からのレスポンス
 */
export interface WorkerResponse {
  /** メッセージID */
  id: number;
  /** 結果（トークン配列 or 'ready'） */
  result?: Token[] | 'ready';
  /** エラーメッセージ */
  error?: string;
}

/**
 * 初期化進度回調
 */
export interface InitProgressCallback {
  /** 進度更新（0-100） */
  onProgress?: (progress: number, message: string) => void;
  /** 初期化完了 */
  onComplete?: () => void;
  /** 初期化失敗 */
  onError?: (error: Error) => void;
}
