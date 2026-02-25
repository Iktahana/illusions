/**
 * Diff service for comparing text content.
 * Uses character-level diffing optimized for Japanese text.
 *
 * テキスト比較用のサービス。日本語テキスト向けに文字レベルの差分を提供する。
 */

import { diffChars } from "diff";

import type { Change } from "diff";

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
  const changes: Change[] = diffChars(oldText, newText);

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
