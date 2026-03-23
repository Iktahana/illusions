/**
 * TXT exporter for MDI content
 *
 * Converts MDI markdown to plain text with two modes:
 * - Plain: strips all MDI/markdown markup, no ruby
 * - With ruby: ruby text placed in fullwidth parentheses（）
 */

import { stripMdiInlineSyntax, replaceMdiWithRubyText } from "./mdi-parser";

/**
 * Convert MDI markdown to plain text without ruby annotations.
 * Strips all MDI syntax and markdown formatting.
 */
export function mdiToPlainText(content: string): string {
  let result = content;

  // Strip all MDI inline syntax (ruby, tcy, nobr, kern)
  result = stripMdiInlineSyntax(result);

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

  // Replace MDI inline syntax with ruby text representation
  result = replaceMdiWithRubyText(result);

  // Strip markdown formatting
  result = stripMarkdown(result);

  return result;
}

/**
 * Strip markdown formatting while preserving text structure.
 * Handles headings, bold, italic, horizontal rules, etc.
 */
export function stripMarkdown(text: string): string {
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
