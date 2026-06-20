/**
 * Shared helpers for full-width-space (U+3000) 字下げ.
 *
 * Some Japanese submission/typesetting workflows require paragraph indentation
 * to be expressed as literal full-width spaces in the text itself (rather than
 * as a layout property such as CSS `text-indent` or Word `firstLine`). This
 * module centralizes the character and the count derivation so the TXT, PDF and
 * DOCX exporters stay consistent.
 *
 * No DOM / Electron / Node dependencies — safe to import from any export path.
 */

/** Full-width space character (U+3000) used for literal 字下げ. */
export const FULLWIDTH_SPACE = "　";

/**
 * Number of full-width spaces to prepend, derived from an em indent value.
 * PDF/DOCX reuse the existing 字下げ（em）value rounded to the nearest integer.
 */
export function fullwidthIndentCount(textIndentEm: number): number {
  if (!Number.isFinite(textIndentEm)) return 0;
  return Math.max(0, Math.round(textIndentEm));
}

/** Prefix string of `count` full-width spaces (empty string when count <= 0). */
export function fullwidthIndentPrefix(count: number): string {
  return count > 0 ? FULLWIDTH_SPACE.repeat(count) : "";
}
