/**
 * 日本語小説向けプラグイン用ユーティリティ（文字数/原稿用紙枚数）
 */

const RUBY_PATTERN = /\{([^|]+)\|([^}]+)\}/g
const MARKDOWN_SYNTAX = /[#*_\[\]()`!\\>-]/g

/**
 * ルビ記法を除去し、本文（base）だけ残す（文字数カウント用）
 */
function stripRuby(text: string): string {
  return text.replace(RUBY_PATTERN, '$1')
}

/**
 * 文字数の概算用に Markdown 記法をざっくり除去する
 * リンク/画像などの完全な解析はしない
 */
function stripMarkdownSyntax(text: string): string {
  return text.replace(MARKDOWN_SYNTAX, '').trim()
}

/**
 * 原稿用紙換算のための文字数を数える（CJK を含む）
 * Array.from でコードポイント単位に数える
 */
export function countCharacters(text: string): number {
  const cleaned = stripMarkdownSyntax(stripRuby(text))
  return Array.from(cleaned).length
}

/**
 * 400字詰原稿用紙の枚数を算出する
 * 標準: 20×20（400字/枚）
 */
export function calculateManuscriptPages(text: string): number {
  const n = countCharacters(text)
  return Math.ceil(n / 400)
}
