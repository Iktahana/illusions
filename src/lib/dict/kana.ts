/**
 * Kana helpers for the reading-index normalization fallback (#1935).
 *
 * The dictionary indexes headwords by written form only, so a kana spelling of a
 * word stored under a kanji headword (e.g. verb 「ある」 → 「有る」) misses an exact
 * lookup. When an ALL-KANA term misses we re-resolve it through the reading
 * index. The all-kana gate is the safety boundary: terms containing kanji (圕,
 * 讀む) keep exact-match semantics so genuinely out-of-dictionary words stay
 * flagged and the lookup never becomes a homophone engine.
 *
 * NOTE: `electron/dict-manager.js` (main process, CommonJS) intentionally keeps
 * a copy of this logic — the two run in different runtimes and cannot share a
 * module. Keep them behaviorally in sync.
 */

/** Every char is hiragana / katakana / 長音符 (no kanji, ASCII, or symbols). */
export function isAllKana(s: string): boolean {
  return typeof s === "string" && s.length > 0 && /^[ぁ-ゖァ-ヺーー]+$/.test(s);
}

/** Hiragana → Katakana (code-point shift); other chars pass through. */
export function toKatakana(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    out += c >= 0x3041 && c <= 0x3096 ? String.fromCodePoint(c + 0x60) : ch;
  }
  return out;
}

/** Katakana → Hiragana (code-point shift); other chars pass through. */
export function toHiragana(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    out += c >= 0x30a1 && c <= 0x30f6 ? String.fromCodePoint(c - 0x60) : ch;
  }
  return out;
}

/**
 * Candidate reading_primary keys for an all-kana term. Probes BOTH scripts so the
 * fallback is robust to whichever convention the dictionary stores readings in.
 */
export function readingForms(term: string): string[] {
  return [...new Set([term, toKatakana(term), toHiragana(term)])];
}
