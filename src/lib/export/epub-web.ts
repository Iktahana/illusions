import { renderEpubWithProfile } from "@illusions-lab/mdi";

import { normalizeExportSource } from "./mdi-export";
import type { EpubExportOptions } from "./epub-shared";

export async function generateEpubBlob(content: string, options: EpubExportOptions): Promise<Blob> {
  const { metadata, fileType, ...profile } = options;
  const archive = await renderEpubWithProfile(normalizeExportSource(content, fileType), {
    profile: {
      layout: { system: "japanese-publisher" },
      metadata,
      typesetting: {
        writingMode: profile.verticalWriting ? "vertical" : "horizontal",
        fontFamily: profile.fontFamily,
        textIndentEm: profile.textIndent,
        fullwidthSpaceIndent: profile.fullwidthSpaceIndent,
      },
      epub: { chapterSplitLevel: profile.chapterSplitLevel },
    },
    ...(profile.coverImage && profile.coverMediaType
      ? { cover: { data: profile.coverImage, mediaType: profile.coverMediaType } }
      : {}),
  });
  return new Blob([new Uint8Array(archive)], { type: "application/epub+zip" });
}
