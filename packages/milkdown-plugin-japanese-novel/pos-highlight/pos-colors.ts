/**
 * 品詞ごとの色設定
 */

import type { PosColorConfig } from './types';

/**
 * デフォルトの品詞色設定
 */
export const DEFAULT_POS_COLORS: PosColorConfig = {
  // 動詞 - 緑系（自立/非自立で飽和度を変える）
  '動詞': '#22c55e',              // 基本緑色
  '動詞-自立': '#16a34a',         // 自立：深い緑（高飽和度）
  '動詞-非自立': '#4ade80',       // 非自立：明るい緑（低飽和度）
  
  // 助詞 - 紫色
  '助詞': '#a855f7',
  
  // 助動詞 - 紫羅蘭
  '助動詞': '#8b5cf6',
  
  // 形容詞 - 青色
  '形容詞': '#3b82f6',
  
  // 副詞 - オレンジ
  '副詞': '#f97316',
  
  // 接続詞 - ティール
  '接続詞': '#14b8a6',
  
  // 感動詞 - ピンク
  '感動詞': '#ec4899',
  
  // 連体詞 - インディゴ
  '連体詞': '#6366f1',
  
  // 記号 - 継承（着色しない）
  '記号': 'inherit',
  
  // 名詞 - 青系
  '名詞': '#60a5fa',
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
  // 記号（句読点、括弧など）は着色しない
  if (pos === '記号') {
    return null;
  }
  
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
