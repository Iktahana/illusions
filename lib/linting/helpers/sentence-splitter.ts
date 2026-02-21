/**
 * Shared sentence-splitting utility for lint rules.
 *
 * Splits Japanese text into sentence spans delimited by 。！？!?\n,
 * returning the text and its positional offsets within the original string.
 */

/** A contiguous sentence extracted from a paragraph. */
export interface SentenceSpan {
  /** The sentence text (excluding the delimiter) */
  readonly text: string;
  /** Start offset in the original text (inclusive) */
  readonly from: number;
  /** End offset in the original text (exclusive) */
  readonly to: number;
}

/**
 * Split `text` into sentences on common Japanese/ASCII delimiters.
 *
 * Handles: 。(U+3002) ！(U+FF01) ？(U+FF1F) ! ? and newline.
 * Empty / whitespace-only segments are skipped.
 */
export function splitIntoSentences(text: string): SentenceSpan[] {
  const sentences: SentenceSpan[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (
      ch === "\u3002" || // 。
      ch === "\uFF01" || // ！
      ch === "\uFF1F" || // ？
      ch === "!" ||
      ch === "?" ||
      ch === "\n"
    ) {
      const sentenceText = text.substring(start, i);
      if (sentenceText.trim().length > 0) {
        sentences.push({ text: sentenceText, from: start, to: i });
      }
      start = i + 1;
    }
  }

  // Handle trailing text without a delimiter
  if (start < text.length) {
    const trailing = text.substring(start);
    if (trailing.trim().length > 0) {
      sentences.push({ text: trailing, from: start, to: text.length });
    }
  }

  return sentences;
}
