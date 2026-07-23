import { normalizeExportSource } from "./mdi-export";

/**
 * Render a complete standalone HTML document through the Rust-authoritative
 * MDI renderer. This module is loaded only by the Electron main process.
 */
export async function generateHtml(content: string, fileType = ".mdi"): Promise<string> {
  const { renderHtmlWithDiagnostics } = await import("@illusions-lab/mdi");
  return renderHtmlWithDiagnostics(normalizeExportSource(content, fileType)).output;
}
