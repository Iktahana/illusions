/**
 * Fixed-vocabulary matcher.
 *
 * For rules that flag a curated set of literal words/notations. Each word is
 * regex-escaped and matched globally; results are returned in document order.
 * Longer words are tried first so that when two entries overlap at the same
 * start position, the longer match wins (e.g. "もっとも" before "もっと").
 */
import type { WordListMatch } from "../sdk/ruleset-context";

/** Escape a literal string for safe use inside a RegExp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchWordList(text: string, words: ReadonlyArray<string>): WordListMatch[] {
  const matches: WordListMatch[] = [];
  // Longest-first so overlapping prefixes don't shadow longer entries.
  const ordered = [...new Set(words)]
    .filter((w) => w.length > 0)
    .sort((a, b) => b.length - a.length);

  for (const word of ordered) {
    const re = new RegExp(escapeRegExp(word), "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({ word, from: m.index, to: m.index + word.length });
    }
  }

  return matches.sort((a, b) => a.from - b.from || b.to - a.to);
}
