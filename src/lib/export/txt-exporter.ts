import { fullwidthIndentPrefix } from "./fullwidth-indent";
import { normalizeExportSource } from "./mdi-export";
import type { TxtExportFormat, TxtIndentOptions } from "./txt-export-types";

export type { TxtExportFormat, TxtIndentOptions } from "./txt-export-types";

/** Node/Electron-only: mdi-core 2.0.9 is published as a nodejs WASM binding. */
export async function exportMdiText(
  content: string,
  format: TxtExportFormat,
  fileType = ".mdi",
  indent?: TxtIndentOptions,
): Promise<string> {
  const { renderTextFormat } = await import("@illusions-lab/mdi");
  const indentCount =
    typeof indent?.indentCount === "number" && Number.isFinite(indent.indentCount)
      ? Math.max(1, Math.min(4, Math.round(indent.indentCount)))
      : 1;
  const indentPrefix = indent?.fullwidthSpaceIndent ? fullwidthIndentPrefix(indentCount) : "";
  return renderTextFormat(
    normalizeExportSource(content, fileType),
    format,
    indentPrefix || undefined,
  );
}
