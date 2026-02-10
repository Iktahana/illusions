/**
 * 品詞ごとの色設定
 */

import type { PosColorConfig } from './types';

/**
 * デフォルトの品詞色設定
 */
export const DEFAULT_POS_COLORS: PosColorConfig = {
  // 名詞 - ブルー（最も多い品詞、落ち着いた色）
  '名詞': '#89b4fa',

  // 動詞 - グリーン系
  '動詞': '#a6e3a1',
  '動詞-自立': '#a6e3a1',
  '動詞-非自立': '#94e2d5',

  // 形容詞 - スカイブルー
  '形容詞': '#74c7ec',

  // 副詞 - モーヴ
  '副詞': '#cba6f7',

  // 助詞 - ミュートグレーブルー（機能語、控えめ）
  '助詞': '#9399b2',

  // 助動詞 - ピーチ
  '助動詞': '#fab387',

  // 接続詞 - イエロー
  '接続詞': '#f9e2af',

  // 感動詞 - ピンク
  '感動詞': '#f38ba8',

  // 連体詞 - ラベンダー
  '連体詞': '#b4befe',

  // 記号 - ディムグレー（控えめ）
  '記号': '#585b70',
};

/**
 * CSS 変数名マッピング
 */
export const POS_CSS_VAR_MAP: Record<string, string> = {
  '動詞': '--pos-verb',
  '動詞-自立': '--pos-verb-intransitive',
  '動詞-非自立': '--pos-verb-transitive',
  '助詞': '--pos-particle',
  '助動詞': '--pos-auxiliary',
  '形容詞': '--pos-adjective',
  '副詞': '--pos-adverb',
  '接続詞': '--pos-conjunction',
  '感動詞': '--pos-interjection',
  '連体詞': '--pos-adnominal',
  '名詞': '--pos-noun',
  '記号': '--pos-symbol',
};

/**
 * 品詞に対応する色を取得する
 * 
 * @param pos 品詞
 * @param posDetail1 品詞細分類1（自立/非自立など）
 * @param customColors ユーザーカスタム色設定
 * @returns 色コード、または null（着色しない）
 */
export function getPosColor(
  pos: string, 
  posDetail1: string | undefined,
  customColors: PosColorConfig
): string | null {
  // まず細分類キー（例: 動詞-自立）をチェック
  const detailKey = posDetail1 ? `${pos}-${posDetail1}` : null;
  if (detailKey && customColors[detailKey] && customColors[detailKey] !== 'inherit') {
    return customColors[detailKey];
  }
  
  // 次に主分類キーをチェック
  if (customColors[pos] && customColors[pos] !== 'inherit') {
    return customColors[pos];
  }
  
  return null;
}
