import { renderTextFormat } from "@illusions-lab/mdi";
import type { MdiTextFormat } from "@illusions-lab/mdi";

import { fullwidthIndentPrefix } from "./fullwidth-indent";
import { normalizeExportSource } from "./mdi-export";

export type TxtExportFormat = MdiTextFormat;

export interface TxtIndentOptions {
  fullwidthSpaceIndent: boolean;
  indentCount: number;
}

export function exportMdiText(
  content: string,
  format: TxtExportFormat,
  fileType = ".mdi",
  indent?: TxtIndentOptions,
): string {
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
export const mdiToPlainText = (content: string, fileType = ".mdi", indent?: TxtIndentOptions) =>
  exportMdiText(content, "txt", fileType, indent);

/** @deprecated Use exportMdiText with the upstream format name. */
export const mdiToRubyText = (content: string, fileType = ".mdi", indent?: TxtIndentOptions) =>
  exportMdiText(content, "txt-ruby", fileType, indent);
