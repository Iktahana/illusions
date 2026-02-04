/**
 * トークン結合のプリセット設定
 */

import type { TokenMergeOptions, TokenizePreset } from './types';

/**
 * 細粒度プリセット（kuromoji原始）
 */
export const FINE_PRESET: TokenMergeOptions = {
  mergeParticles: false,
  mergeVerbAuxiliary: false,
  mergeAdjectiveAux: false,
  mergeAdverbParticle: false,
  mergeNounSuffix: false,
  maxParticleChain: 1,
  maxAuxiliaryChain: 1,
};

/**
 * 中等粒度プリセット（推奨・バランス）
 */
export const MEDIUM_PRESET: TokenMergeOptions = {
  mergeParticles: true,
  mergeVerbAuxiliary: true,
  mergeAdjectiveAux: true,
  mergeAdverbParticle: false,
  mergeNounSuffix: false,
  maxParticleChain: 3,
  maxAuxiliaryChain: 3,
};

/**
 * 粗粒度プリセット（閲読用・最大結合）
 */
export const COARSE_PRESET: TokenMergeOptions = {
  mergeParticles: true,
  mergeVerbAuxiliary: true,
  mergeAdjectiveAux: true,
  mergeAdverbParticle: true,
  mergeNounSuffix: true,
  maxParticleChain: 5,
  maxAuxiliaryChain: 5,
};

/**
 * プリセット名からオプションを取得
 */
export function getPresetOptions(preset: TokenizePreset): TokenMergeOptions {
  switch (preset) {
    case 'fine':
      return FINE_PRESET;
    case 'medium':
      return MEDIUM_PRESET;
    case 'coarse':
      return COARSE_PRESET;
    case 'custom':
      // カスタムの場合は medium をベースにする
      return { ...MEDIUM_PRESET };
    default:
      return MEDIUM_PRESET;
  }
}

/**
 * プリセットの表示名
 */
export const PRESET_LABELS: Record<TokenizePreset, string> = {
  fine: '細粒度（語言学）',
  medium: '標準（推奨）',
  coarse: '粗粒度（閲読）',
  custom: 'カスタム',
};

/**
 * プリセットの説明
 */
export const PRESET_DESCRIPTIONS: Record<TokenizePreset, string> = {
  fine: 'kuromoji原始の細かい分詞。例：なっ｜た',
  medium: 'バランスの取れた分詞。例：なった',
  coarse: '最大限結合した粗い分詞。例：突如として｜相続人となった',
  custom: '自分で詳細設定をカスタマイズ',
};
