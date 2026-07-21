/** Upstream EPUB options; Illusions owns only UI-facing metadata and source type. */
import type { MdiEpubExportOptions } from "@illusions-lab/mdi";
import type { ExportMetadata } from "./types";

export type ChapterSplitLevel = "h1" | "h2" | "h3" | "none";

export interface EpubExportOptions extends Omit<MdiEpubExportOptions, "coverMediaType"> {
  metadata: ExportMetadata & { publisher?: string; identifier?: string };
  coverMediaType?: "image/jpeg" | "image/png";
  fileType?: string;
}
