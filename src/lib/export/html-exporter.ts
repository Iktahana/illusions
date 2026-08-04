import { normalizeExportSource } from "./mdi-export";
import type { HtmlExportOptions, HtmlWritingMode } from "./html-shared";

function withWritingMode(source: string, writingMode?: HtmlWritingMode): string {
  if (!writingMode) return source;

  const frontmatter = /^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/;
  const match = source.match(frontmatter);
  if (!match) return `---\nwriting-mode: ${writingMode}\n---\n\n${source}`;

  const fields = /^writing-mode:\s*.*$/m.test(match[2])
    ? match[2].replace(/^writing-mode:\s*.*$/m, `writing-mode: ${writingMode}`)
    : `${match[2]}\nwriting-mode: ${writingMode}`;
  return source.replace(frontmatter, `${match[1]}${fields}${match[3]}`);
}

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
  const { writingMode, ...renderOptions } = options;
  const source = withWritingMode(normalizeExportSource(content, fileType), writingMode);
  return renderHtmlWithDiagnostics(source, renderOptions).output;
}
