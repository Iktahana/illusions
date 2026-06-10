/**
 * TXT exporter for MDI content
 *
 * Converts MDI markdown to plain text with two modes:
 * - Plain: strips all MDI/markdown markup, no ruby
 * - With ruby: ruby text placed in fullwidth parentheses（）
 *
 * The actual transformation is owned by the single MDI entry API
 * (`MdiDocument.toExportText`, issue #1449); this module keeps the
 * export-facing function names.
 */

import { MdiDocument } from "@/packages/milkdown-plugin-japanese-novel/mdi-document";

/**
 * Convert MDI markdown to plain text without ruby annotations.
 * Strips all MDI syntax and markdown formatting.
 */
export function mdiToPlainText(content: string): string {
  return MdiDocument.fromRawText(content).toExportText("txt");
}

/**
 * Convert MDI markdown to text with ruby in fullwidth parentheses.
 * Example: {漢字|かんじ} → 漢字（かんじ）
 */
export function mdiToRubyText(content: string): string {
  return MdiDocument.fromRawText(content).toExportText("txt-ruby");
}
