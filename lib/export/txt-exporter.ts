/**
 * TXT exporter for MDI content
 *
 * Converts MDI markdown to plain text with two modes:
 * - Plain: strips all MDI/markdown markup, no ruby
 * - With ruby: ruby text placed in fullwidth parentheses（）
 */

/**
 * Convert MDI markdown to plain text without ruby annotations.
 * Strips all MDI syntax and markdown formatting.
 */
export function mdiToPlainText(content: string): string {
  let result = content;

  // Ruby: {base|ruby} → base (discard ruby)
  result = result.replace(/\{([^|{}]+)\|[^}]+\}/g, "$1");

  // Tate-chu-yoko: ^text^ → text
  result = result.replace(/\^([^^]+)\^/g, "$1");

  // No-break: [[no-break:text]] → text
  result = result.replace(/\[\[no-break:([^\]]+)\]\]/g, "$1");

  // Kerning: [[kern:val:text]] → text
  result = result.replace(/\[\[kern:[^:\]]+:([^\]]+)\]\]/g, "$1");

  // Strip markdown formatting
  result = stripMarkdown(result);

  return result;
}

/**
 * Convert MDI markdown to text with ruby in fullwidth parentheses.
 * Example: {漢字|かんじ} → 漢字（かんじ）
 */
export function mdiToRubyText(content: string): string {
  let result = content;

  // Ruby: {base|ruby} → base（ruby）
  // Remove dots in split ruby (e.g. とう.きょう → とうきょう)
  result = result.replace(
    /\{([^|{}]+)\|([^}]+)\}/g,
    (_match, base: string, ruby: string) => {
      const cleanRuby = ruby.replace(/\./g, "");
      return `${base}\uFF08${cleanRuby}\uFF09`;
    },
  );

  // Tate-chu-yoko: ^text^ → text
  result = result.replace(/\^([^^]+)\^/g, "$1");

  // No-break: [[no-break:text]] → text
  result = result.replace(/\[\[no-break:([^\]]+)\]\]/g, "$1");

  // Kerning: [[kern:val:text]] → text
  result = result.replace(/\[\[kern:[^:\]]+:([^\]]+)\]\]/g, "$1");

  // Strip markdown formatting
  result = stripMarkdown(result);

  return result;
}

/**
 * Strip markdown formatting while preserving text structure.
 * Handles headings, bold, italic, horizontal rules, etc.
 */
function stripMarkdown(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    let processed = line;

    // Headings: # Title → Title
    processed = processed.replace(/^#{1,6}\s+/, "");

    // Horizontal rules: --- / *** / ___ → empty line
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(processed.trim())) {
      result.push("");
      continue;
    }

    // Bold italic: ***text*** → text
    processed = processed.replace(/\*\*\*(.+?)\*\*\*/g, "$1");

    // Bold: **text** → text
    processed = processed.replace(/\*\*(.+?)\*\*/g, "$1");

    // Italic: *text* → text
    processed = processed.replace(/\*(.+?)\*/g, "$1");

    // Escaped characters: \{ \^ \[ → literal
    processed = processed.replace(/\\([{^[\]])/g, "$1");

    result.push(processed);
  }

  return result.join("\n");
}
