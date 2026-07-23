import type { TxtExportFormat } from "./txt-export-types";
import { safeExportBaseName } from "./safe-export-filename";

const FORMAT_SUFFIX: Record<TxtExportFormat, string> = {
  txt: "",
  "txt-ruby": "_ruby",
  narou: "_narou",
  kakuyomu: "_kakuyomu",
  aozora: "_aozora",
};

/** Build a cross-platform-safe default filename for native TXT export. */
export function txtExportSuggestedName(title: unknown, format: TxtExportFormat): string {
  return `${safeExportBaseName(title)}${FORMAT_SUFFIX[format]}.txt`;
}
