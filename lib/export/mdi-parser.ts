/**
 * Shared MDI inline syntax parser
 *
 * Centralizes all MDI inline format regex patterns and transformations.
 * Each exporter calls the shared parser with a mode to get format-specific output.
 *
 * MDI inline constructs:
 * - Ruby:          {base|ruby}
 * - Tate-chu-yoko: ^text^
 * - No-break:      [[no-break:text]]
 * - Kerning:       [[kern:amount:text]]
 * - Line break:    [[br]]
 * - Escaped:       \{  \^  \[
 */

// ---------------------------------------------------------------------------
// Regex patterns — single source of truth for all MDI inline constructs
// ---------------------------------------------------------------------------

/** Ruby annotation: {base|ruby} */
export const MDI_RUBY_RE = /\{([^|{}]+)\|([^|}]+)\}/g;

/** Tate-chu-yoko: ^text^ */
export const MDI_TCY_RE = /\^([^^]+)\^/g;

/** No-break span: [[no-break:text]] */
export const MDI_NOBR_RE = /\[\[no-break:([^\]]+)\]\]/g;

/** Kerning: [[kern:amount:text]] */
export const MDI_KERN_RE = /\[\[kern:([^:\]]+):([^\]]+)\]\]/g;

/** MDI explicit line break: [[br]] */
export const MDI_BREAK_RE = /\[\[br\]\]/g;

/** Escaped MDI opening brace: \{ */
export const MDI_ESC_BRACE_RE = /\\(\{)/g;

/** Escaped MDI caret: \^ */
export const MDI_ESC_CARET_RE = /\\(\^)/g;

/** Escaped MDI bracket: \[ */
export const MDI_ESC_BRACKET_RE = /\\(\[)/g;

/** Valid kern amount pattern (e.g. "0.5em", "-1em", "+0.25em") */
export const MDI_KERN_AMOUNT_RE = /^[+-]?\d+(\.\d+)?em$/;

// ---------------------------------------------------------------------------
// Plain-text transformation (strip all MDI markup, discard ruby readings)
// ---------------------------------------------------------------------------

/**
 * Strip all MDI inline syntax from text, keeping only base text.
 * Ruby readings are discarded: {漢字|かんじ} → 漢字
 */
export function stripMdiInlineSyntax(text: string): string {
  let result = text;

  // Ruby: keep base, discard ruby
  result = result.replace(MDI_RUBY_RE, "$1");

  // Tate-chu-yoko: keep text
  result = result.replace(MDI_TCY_RE, "$1");

  // No-break: keep text
  result = result.replace(MDI_NOBR_RE, "$1");

  // Kerning: keep text
  result = result.replace(MDI_KERN_RE, "$2");

  // Explicit line break: newline
  result = result.replace(MDI_BREAK_RE, "\n");

  return result;
}

// ---------------------------------------------------------------------------
// Ruby-text transformation (ruby in fullwidth parentheses)
// ---------------------------------------------------------------------------

/**
 * Replace MDI inline syntax, rendering ruby as fullwidth parentheses.
 * Used by txt-exporter (ruby mode) and docx-exporter.
 * Example: {漢字|かんじ} → 漢字（かんじ）
 */
export function replaceMdiWithRubyText(text: string): string {
  let result = text;

  // Ruby: base（ruby）  — strip dots from split ruby
  result = result.replace(MDI_RUBY_RE, (_match, base: string, ruby: string) => {
    const cleanRuby = ruby.replace(/\./g, "");
    return `${base}\uFF08${cleanRuby}\uFF09`;
  });

  // Tate-chu-yoko: keep text
  result = result.replace(MDI_TCY_RE, "$1");

  // No-break: keep text
  result = result.replace(MDI_NOBR_RE, "$1");

  // Kerning: keep text
  result = result.replace(MDI_KERN_RE, "$2");

  // Explicit line break: newline
  result = result.replace(MDI_BREAK_RE, "\n");

  return result;
}
