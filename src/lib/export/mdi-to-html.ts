/** Compatibility facade for callers that need HTML. Rendering is Rust-owned. */
import { renderHtml, renderHtmlWithDiagnostics } from "@illusions-lab/mdi";

import { normalizeExportSource } from "./mdi-export";
import type { ExportMetadata } from "./types";

export interface MdiToHtmlOptions {
  bodyOnly?: boolean;
  metadata?: ExportMetadata;
  fileType?: string;
  /** Legacy host-only presentation options are intentionally ignored. */
  [key: string]: unknown;
}

export function mdiToHtml(content: string, options: MdiToHtmlOptions = {}): string {
  return renderHtml(normalizeExportSource(content, options.fileType), {
    bodyOnly: options.bodyOnly,
  });
}

export function mdiToHtmlWithDiagnostics(content: string, options: MdiToHtmlOptions = {}) {
  return renderHtmlWithDiagnostics(normalizeExportSource(content, options.fileType), {
    bodyOnly: options.bodyOnly,
  });
}
