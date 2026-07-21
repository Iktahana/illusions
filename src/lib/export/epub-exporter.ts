import { renderEpubWithProfile } from "@illusions-lab/mdi";

import { normalizeExportSource } from "./mdi-export";
import type { EpubExportOptions } from "./epub-shared";

export type { EpubExportOptions } from "./epub-shared";

export async function generateEpub(content: string, options: EpubExportOptions): Promise<Buffer> {
  const { metadata, fileType, ...profile } = options;
  return Buffer.from(
    await renderEpubWithProfile(normalizeExportSource(content, fileType), {
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
    }),
  );
}
