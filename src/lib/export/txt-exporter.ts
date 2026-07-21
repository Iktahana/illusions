import { fullwidthIndentPrefix } from "./fullwidth-indent";
import { normalizeExportSource } from "./mdi-export";

export type TxtExportFormat = "txt" | "txt-ruby" | "narou" | "kakuyomu" | "aozora";

export interface TxtIndentOptions {
  fullwidthSpaceIndent: boolean;
  indentCount: number;
}

/** Node/Electron-only: mdi-core 2.0.9 is published as a nodejs WASM binding. */
export async function exportMdiText(
  content: string,
  format: TxtExportFormat,
  fileType = ".mdi",
  indent?: TxtIndentOptions,
): Promise<string> {
  const { renderTextFormat } = await import("@illusions-lab/mdi");
  const indentPrefix = indent?.fullwidthSpaceIndent
    ? fullwidthIndentPrefix(indent.indentCount)
    : "";
  return renderTextFormat(
    normalizeExportSource(content, fileType),
    format,
    indentPrefix || undefined,
  );
}

/** @deprecated Use exportMdiText with the upstream format name. */
export const mdiToPlainText = async (
  content: string,
  fileType = ".mdi",
  indent?: TxtIndentOptions,
) => exportMdiText(content, "txt", fileType, indent);

/** @deprecated Use exportMdiText with the upstream format name. */
export const mdiToRubyText = async (
  content: string,
  fileType = ".mdi",
  indent?: TxtIndentOptions,
) => exportMdiText(content, "txt-ruby", fileType, indent);
