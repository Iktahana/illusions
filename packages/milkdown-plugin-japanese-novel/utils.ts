/**
 * 日本語小説向けプラグイン用ユーティリティ（文字数/原稿用紙枚数）
 */

const MARKDOWN_SYNTAX = new Set(["#", "*", "_", "[", "]", "(", ")", "`", "!", "\\", ">", "-"]);

/**
 * ルビ記法を除去し、本文（base）だけ残す（文字数カウント用）
 */
function stripRuby(text: string): string {
  let result = "";
  let cursor = 0;

  while (cursor < text.length) {
    const open = text.indexOf("{", cursor);
    if (open === -1) {
      result += text.slice(cursor);
      break;
    }

    const pipe = text.indexOf("|", open + 1);
    const close = pipe === -1 ? -1 : text.indexOf("}", pipe + 1);
    if (pipe === -1 || close === -1) {
      result += text.slice(cursor);
      break;
    }

    result += text.slice(cursor, open);
    result += text.slice(open + 1, pipe);
    cursor = close + 1;
  }

  return result;
}

/**
 * 文字数の概算用に Markdown 記法をざっくり除去する
 * リンク/画像などの完全な解析はしない
 */
function stripMarkdownSyntax(text: string): string {
  return Array.from(text)
    .filter((char) => !MARKDOWN_SYNTAX.has(char))
    .join("")
    .trim();
}

/**
 * 原稿用紙換算のための文字数を数える（CJK を含む）
 * Array.from でコードポイント単位に数える
 */
export function countCharacters(text: string): number {
  const cleaned = stripMarkdownSyntax(stripRuby(text));
  return Array.from(cleaned).length;
}

/**
 * 400字詰原稿用紙の枚数を算出する
 * 標準: 20×20（400字/枚）
 */
export function calculateManuscriptPages(text: string): number {
  const n = countCharacters(text);
  return Math.ceil(n / 400);
}
