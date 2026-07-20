/**
 * Diff service for comparing text content.
 * Uses character-level diffing optimized for Japanese text.
 *
 * テキスト比較用のサービス。日本語テキスト向けに文字レベルの差分を提供する。
 */

import { diffChars } from "diff";

import type { Change } from "diff";

/**
 * Normalize text for diff comparison by stripping HTML tags.
 * Converts `<br>` to newlines and removes other HTML tags so that
 * formatting-only changes don't appear as content diffs.
 *
 * diff比較用にHTMLタグを除去する。`<br>`は改行に変換し、
 * その他のHTMLタグは削除する。
 */
export function stripHtmlForDiff(text: string): string {
  let result = "";
  let cursor = 0;

  while (cursor < text.length) {
    const open = text.indexOf("<", cursor);
    if (open === -1) {
      result += text.slice(cursor);
      break;
    }

    result += text.slice(cursor, open);
    const close = text.indexOf(">", open + 1);
    if (close === -1) {
      result += text.slice(open);
      break;
    }

    const tag = text
      .slice(open + 1, close)
      .trim()
      .toLowerCase();
    if (tag === "br" || tag === "br/") {
      result += "\n";
    }
    cursor = close + 1;
  }

  return result;
}

/** A single diff chunk with type and value */
export interface DiffChunk {
  type: "added" | "removed" | "unchanged";
  value: string;
}

/**
 * Compare two strings and return character-level diff chunks.
 * Suitable for Japanese text where word boundaries are not space-delimited.
 *
 * 二つの文字列を比較し、文字レベルの差分チャンクを返す。
 * 単語区切りがスペースでない日本語テキストに適している。
 *
 * @param oldText - The original (snapshot) text
 * @param newText - The current (editor) text
 * @returns Array of diff chunks
 */
export function computeDiff(oldText: string, newText: string): DiffChunk[] {
  const changes: Change[] = diffChars(stripHtmlForDiff(oldText), stripHtmlForDiff(newText));

  return changes.map((change) => ({
    type: change.added ? "added" : change.removed ? "removed" : "unchanged",
    value: change.value,
  }));
}

/**
 * Calculate diff statistics.
 * 差分の統計情報を計算する。
 */
export function getDiffStats(chunks: DiffChunk[]): {
  addedChars: number;
  removedChars: number;
  unchangedChars: number;
} {
  let addedChars = 0;
  let removedChars = 0;
  let unchangedChars = 0;

  for (const chunk of chunks) {
    const len = chunk.value.length;
    switch (chunk.type) {
      case "added":
        addedChars += len;
        break;
      case "removed":
        removedChars += len;
        break;
      case "unchanged":
        unchangedChars += len;
        break;
    }
  }

  return { addedChars, removedChars, unchangedChars };
}
