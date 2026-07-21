import { renderDocxWithProfile } from "@illusions-lab/mdi";

import { normalizeExportSource, toExportProfile } from "./mdi-export";
import { DEFAULT_EXPORT_SETTINGS } from "./export-settings";
import type { UnifiedExportSettings } from "./export-settings";
import type { ExportMetadata } from "./types";

export interface DocxExportOptions {
  metadata: ExportMetadata;
  settings?: Partial<UnifiedExportSettings>;
  fileType?: string;
}

function profileFor(options: DocxExportOptions) {
  return toExportProfile({ ...DEFAULT_EXPORT_SETTINGS, ...options.settings }, options.metadata);
}

export async function generateDocx(content: string, options: DocxExportOptions): Promise<Buffer> {
  return Buffer.from(
    await renderDocxWithProfile(
      normalizeExportSource(content, options.fileType),
      profileFor(options),
    ),
  );
}

export async function generateDocxBlob(content: string, options: DocxExportOptions): Promise<Blob> {
  const bytes = await renderDocxWithProfile(
    normalizeExportSource(content, options.fileType),
    profileFor(options),
  );
  return new Blob([new Uint8Array(bytes)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
