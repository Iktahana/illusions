/**
 * Strips Markdown syntax from a string, preserving plain text content.
 * Japanese text is preserved untouched.
 */

/**
 * Remove Markdown formatting from the given string and return plain text.
 *
 * Handled constructs:
 * - Headings: `# / ## / ###` prefix removed, heading text kept
 * - Bold/italic: `**text**` / `*text*` → `text`
 * - Strikethrough: `~~text~~` → `text`
 * - Inline code: `` `code` `` → `code`
 * - Links: `[text](url)` → `text`
 * - Blockquote prefix: `> ` removed
 * - List prefixes: `- ` / `* ` / `1. ` removed
 * - Horizontal rules: `---` / `***` / `___` lines removed entirely
 */
export function stripMarkdown(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => stripLine(line))
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * Strip Markdown from a single line.
 * Returns `null` if the line should be removed entirely (e.g. horizontal rules).
 */
function stripLine(line: string): string | null {
  // Remove horizontal rules (lines that are entirely --- / *** / ___)
  if (/^(\s*)(---|\*\*\*|___)(\s*)$/.test(line)) {
    return null;
  }

  // Remove blockquote prefix: "> "
  line = line.replace(/^>\s?/, "");

  // Remove heading prefix: "# ", "## ", "### ", etc.
  line = line.replace(/^#{1,6}\s+/, "");

  // Remove ordered list prefix: "1. ", "2. ", etc.
  line = line.replace(/^\d+\.\s+/, "");

  // Remove unordered list prefix: "- " or "* "
  line = line.replace(/^[-*]\s+/, "");

  // Inline code: `code` → code (process before bold/italic to avoid conflicts)
  line = line.replace(/`([^`]*)`/g, "$1");

  // Links: [text](url) → text
  line = line.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

  // Bold + italic combined: ***text*** or ___text___
  line = line.replace(/\*{3}([^*]*)\*{3}/g, "$1");
  line = line.replace(/_{3}([^_]*)_{3}/g, "$1");

  // Bold: **text** or __text__
  line = line.replace(/\*{2}([^*]*)\*{2}/g, "$1");
  line = line.replace(/_{2}([^_]*)_{2}/g, "$1");

  // Italic: *text* or _text_
  line = line.replace(/\*([^*]+)\*/g, "$1");
  line = line.replace(/_([^_]+)_/g, "$1");

  // Strikethrough: ~~text~~
  line = line.replace(/~~([^~]*)~~/g, "$1");

  return line;
}
