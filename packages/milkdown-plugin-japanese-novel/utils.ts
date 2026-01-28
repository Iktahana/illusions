/**
 * Utility functions for Japanese novel plugin: character count, manuscript pages.
 */

const RUBY_PATTERN = /\{([^|]+)\|([^}]+)\}/g
const MARKDOWN_SYNTAX = /[#*_\[\]()`!\\>-]/g

/**
 * Strip Ruby syntax, keeping only base text. Used for character count.
 */
function stripRuby(text: string): string {
  return text.replace(RUBY_PATTERN, '$1')
}

/**
 * Strip common Markdown syntax for a rough character count.
 * Does not parse full Markdown (e.g. links, images).
 */
function stripMarkdownSyntax(text: string): string {
  return text.replace(MARKDOWN_SYNTAX, '').trim()
}

/**
 * Count characters (including CJK) for manuscript calculation.
 * Uses Array.from to count grapheme clusters / Unicode code points correctly.
 */
export function countCharacters(text: string): number {
  const cleaned = stripMarkdownSyntax(stripRuby(text))
  return Array.from(cleaned).length
}

/**
 * Calculate 400-character manuscript pages (400字詰原稿用紙).
 * Standard Japanese manuscript format: 20×20 characters per page.
 */
export function calculateManuscriptPages(text: string): number {
  const n = countCharacters(text)
  return Math.ceil(n / 400)
}
