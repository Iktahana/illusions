/**
 * TXT exporter for MDI content
 *
 * Converts MDI markdown to plain text with two modes:
 * - Plain: strips all MDI/markdown markup, no ruby
 * - With ruby: ruby text placed in fullwidth parentheses（）
 */

import { stripMdiInlineSyntax, replaceMdiWithRubyText } from "./mdi-parser";

/** Inline regex for [[blank]] paragraph marker */
const BLANK_PARA_RE = /^\[\[blank\]\]$/;

/** Sentinel to distinguish scene breaks from paragraph-separation blank lines */
const SCENE_BREAK_MARKER = "\x00SCENE_BREAK\x00";

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
  result = collapseBlankLines(result);

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
  result = collapseBlankLines(result);

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

    // [[blank]] paragraph marker → forced blank line
    if (BLANK_PARA_RE.test(processed.trim())) {
      result.push(SCENE_BREAK_MARKER);
      continue;
    }

    // Horizontal rules: --- / *** / ___ → empty line
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(processed.trim())) {
      result.push(SCENE_BREAK_MARKER);
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

/**
 * Remove blank lines between paragraphs for Japanese typesetting (組版).
 * Scene breaks are preserved as a single blank line separator.
 */
function collapseBlankLines(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let consecutiveBlankCount = 0;

  for (const line of lines) {
    if (line === SCENE_BREAK_MARKER) {
      consecutiveBlankCount = 0;
      result.push("");
      continue;
    }

    if (line.trim() === "") {
      consecutiveBlankCount++;
      // First blank line is structural (Markdown paragraph separator) — skip it.
      // Additional blank lines are author-intentional — preserve them.
      if (consecutiveBlankCount > 1) {
        result.push("");
      }
      continue;
    }

    consecutiveBlankCount = 0;
    result.push(line);
  }

  // Trim leading/trailing blank lines — no content to separate at boundaries
  while (result.length > 0 && result[0] === "") {
    result.shift();
  }
  while (result.length > 0 && result[result.length - 1] === "") {
    result.pop();
  }

  return result.join("\n");
}
