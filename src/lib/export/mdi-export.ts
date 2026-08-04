/**
 * The only Illusions-side boundary around document export.
 *
 * MDI syntax and document rendering belong to @illusions-lab/mdi.  This file
 * only normalizes Milkdown's serialized source and maps the application's UI
 * settings to the upstream publication profile.
 */
import type { ExportProfile } from "@illusions-lab/mdi-export-profile";
import { MdiDocument } from "@/packages/milkdown-plugin-japanese-novel/mdi-document";

import type { UnifiedExportSettings } from "./export-settings";
import type { ExportMetadata } from "./types";

export const DEFAULT_LAYOUT_SYSTEM = "japanese-publisher" as const;

/** Preserve raw .md/.txt input; normalize only the editor's escaped .mdi output. */
export function normalizeExportSource(content: string, fileType = ".mdi"): string {
  return fileType === ".mdi"
    ? MdiDocument.fromEditorOutput(content, { fileType: ".mdi" }).toRawText()
    : content;
}

export function toExportProfile(
  settings: Pick<
    UnifiedExportSettings,
    | "pageSize"
    | "landscape"
    | "verticalWriting"
    | "charsPerLine"
    | "linesPerPage"
    | "margins"
    | "fontFamily"
    | "showPageNumbers"
    | "pageNumberFormat"
    | "pageNumberPosition"
    | "textIndent"
    | "fullwidthSpaceIndent"
    | "epubChapterSplitLevel"
  >,
  metadata: ExportMetadata,
): ExportProfile {
  return {
    layout: { system: DEFAULT_LAYOUT_SYSTEM },
    metadata,
    typesetting: {
      writingMode: settings.verticalWriting ? "vertical" : "horizontal",
      fontFamily: settings.fontFamily,
      textIndentEm: settings.textIndent,
      fullwidthSpaceIndent: settings.fullwidthSpaceIndent,
    },
    pagination: {
      pageSize: settings.pageSize as NonNullable<ExportProfile["pagination"]>["pageSize"],
      landscape: settings.landscape,
      charactersPerLine: settings.charsPerLine,
      linesPerPage: settings.linesPerPage,
      margins: settings.margins,
      pageNumbers: {
        enabled: settings.showPageNumbers,
        format: settings.pageNumberFormat,
        position: settings.pageNumberPosition,
      },
    },
    epub: { chapterSplitLevel: settings.epubChapterSplitLevel },
  };
}
