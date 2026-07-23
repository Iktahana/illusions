import { normalizeExportSource } from "./mdi-export";
import type { HtmlExportOptions } from "./html-shared";

/**
 * Render HTML through the Rust-authoritative MDI renderer. Depending on
 * `bodyOnly`, the output is either a standalone document or a body fragment.
 * This module is loaded only by the Electron main process.
 */
export async function generateHtml(
  content: string,
  fileType = ".mdi",
  options: HtmlExportOptions = {},
): Promise<string> {
  const { renderHtmlWithDiagnostics } = await import("@illusions-lab/mdi");
  return renderHtmlWithDiagnostics(normalizeExportSource(content, fileType), options).output;
}
