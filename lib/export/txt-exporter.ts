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
 *
 * `content` is the live editor serializer output, where the Milkdown markdown
 * serializer escapes MDI bracket macros (`[[blank]]` → `\[\[blank]]`) and may
 * emit `<br />`. We therefore go through `fromEditorOutput`, which un-escapes
 * the macros and normalizes `<br />` before the marker-aware export pipeline
 * runs (otherwise `[[blank]]` / `<br />` leak into the .txt). `fromEditorOutput`
 * is idempotent on already-clean raw text, so on-disk content is unaffected.
 *
 * @param content - Milkdown/ProseMirror serializer output
 * @param fileType - Active document file extension (".mdi" | ".md" | ".txt").
 *   Defaults to ".mdi". Non-MDI types skip macro un-escaping so that an
 *   author's intentional literal `\[\[blank]]` is not silently promoted to a
 *   blank line (DATA-LOSS guard).
 */
export function mdiToPlainText(content: string, fileType: string = ".mdi"): string {
  return MdiDocument.fromEditorOutput(content, { fileType }).toExportText("txt");
}

/**
 * Convert MDI markdown to text with ruby in fullwidth parentheses.
 * Example: {漢字|かんじ} → 漢字（かんじ）
 *
 * @param content - Milkdown/ProseMirror serializer output
 * @param fileType - Active document file extension. See {@link mdiToPlainText}.
 */
export function mdiToRubyText(content: string, fileType: string = ".mdi"): string {
  return MdiDocument.fromEditorOutput(content, { fileType }).toExportText("txt-ruby");
}
