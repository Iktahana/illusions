/**
 * NFKC normalization helpers.
 *
 * NFKC is the "wheel" we use instead of hand-maintained conversion maps:
 *  - half-width katakana → full-width, INCLUDING dakuten composition
 *    (e.g. "ﾄﾞ" → "ド", which a naive per-character map turns into "ト゛").
 *    This is the Tier B audit fix.
 *  - full-width ASCII alphanumerics → half-width.
 *
 * Callers should normalize only the matched substring (e.g. a run of half-width
 * katakana), not the whole document, to avoid normalizing unrelated text.
 */

/** Apply Unicode NFKC normalization. */
export function nfkc(input: string): string {
  return input.normalize("NFKC");
}

/** True when `input` is already NFKC-normalized (no changes needed). */
export function isNfkc(input: string): boolean {
  return input.normalize("NFKC") === input;
}
