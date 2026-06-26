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
import { fullwidthIndentPrefix } from "./fullwidth-indent";

/** Options controlling literal full-width-space (U+3000) 字下げ for TXT export. */
export interface TxtIndentOptions {
  /** When true, prepend full-width spaces to each non-empty line. */
  fullwidthSpaceIndent: boolean;
  /** Number of full-width spaces to prepend (>= 1 when enabled). */
  indentCount: number;
}

/**
 * Prepend `count` full-width spaces (U+3000) to each non-empty line.
 * Blank lines are preserved as-is so paragraph spacing is not disturbed.
 */
function applyFullwidthIndent(text: string, options?: TxtIndentOptions): string {
  if (!options?.fullwidthSpaceIndent) return text;
  const prefix = fullwidthIndentPrefix(options.indentCount);
  if (!prefix) return text;
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? prefix + line : line))
    .join("\n");
}

/**
 * Build the source MDI document for an export, branching on file type.
 *
 * - `.mdi`: `content` is the live editor serializer output. The Milkdown
 *   markdown serializer escapes MDI bracket macros (`[[blank]]` → `\[\[blank]]`)
 *   and may emit `<br />` / wrap content in HTML tags. We therefore go through
 *   `fromEditorOutput({ fileType: ".mdi" })`, which un-escapes the macros and
 *   normalizes editor-injected HTML before the marker-aware pipeline runs
 *   (otherwise `[[blank]]` / `<br />` leak into the export).
 * - Non-`.mdi` (`.md` / `.txt` / anything else): `content` is plain authored
 *   text. We use `fromRawText`, which applies NO normalization — literal
 *   `<br />`, `<p>x</p>`, `\[\[blank]]` are preserved verbatim (DATA-LOSS guard:
 *   the editor-HTML rewrites in `fromEditorOutput` are MDI-only).
 */
function buildExportDocument(content: string, fileType: string): MdiDocument {
  return fileType === ".mdi"
    ? MdiDocument.fromEditorOutput(content, { fileType: ".mdi" })
    : MdiDocument.fromRawText(content);
}

/**
 * Convert MDI markdown to plain text without ruby annotations.
 * Strips all MDI syntax and markdown formatting.
 *
 * @param content - Milkdown/ProseMirror serializer output (`.mdi`) or raw
 *   authored text (non-`.mdi`)
 * @param fileType - Active document file extension (".mdi" | ".md" | ".txt").
 *   Defaults to ".mdi". See {@link buildExportDocument} for the branch rationale.
 */
export function mdiToPlainText(
  content: string,
  fileType: string = ".mdi",
  indent?: TxtIndentOptions,
): string {
  return applyFullwidthIndent(buildExportDocument(content, fileType).toExportText("txt"), indent);
}

/**
 * Convert MDI markdown to text with ruby in fullwidth parentheses.
 * Example: {漢字|かんじ} → 漢字（かんじ）
 *
 * @param content - Milkdown/ProseMirror serializer output (`.mdi`) or raw
 *   authored text (non-`.mdi`)
 * @param fileType - Active document file extension. See {@link mdiToPlainText}.
 */
export function mdiToRubyText(
  content: string,
  fileType: string = ".mdi",
  indent?: TxtIndentOptions,
): string {
  return applyFullwidthIndent(
    buildExportDocument(content, fileType).toExportText("txt-ruby"),
    indent,
  );
}
