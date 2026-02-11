/**
 * 品詞ごとの色設定
 */

import type { PosColorConfig } from './types';

/**
 * デフォルトの品詞色設定
 */
export const DEFAULT_POS_COLORS: PosColorConfig = {
  // 名詞 - 綻青 (Azure)：穩重、高辨識度
  '名詞': '#4A90E2',

  // 動詞（自立） - 深翠 (Emerald)：句子の核心動力
  '動詞': '#27AE60',
  '動詞-自立': '#27AE60',
  // 動詞（非自立） - 青磁 (Teal)：自立動詞と同系だが補助的
  '動詞-非自立': '#1ABC9C',

  // 形容詞 - 露草 (Sky Blue)：清爽、名詞の深藍と区別
  '形容詞': '#00A8FF',

  // 副詞 - 杜若 (Magenta)：強烈な存在感、修飾リズムを標注
  '副詞': '#E84393',

  // 助詞 - 薄紫 (Amethyst)：格助詞の核心、低調だが明瞭
  '助詞': '#8E44AD',

  // 助動詞 - 琥珀 (Amber)：暖色調、動詞後方で対比を形成
  '助動詞': '#E67E22',

  // 接続詞 - 金茶 (Gold)：白底でも読みやすい深み
  '接続詞': '#D4A017',

  // 連体詞 - 藤紫 (Lavender)：冷めの紫色、助詞と区別
  '連体詞': '#6C5CE7',

  // 感動詞 - 珊瑚 (Coral)：温かく醒目、感情の爆発
  '感動詞': '#FF7675',

  // 記号 - 石板灰 (Slate)：中性グレー、視覚干渉を弱化
  '記号': '#7F8C8D',
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
