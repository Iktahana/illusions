/**
 * Shared EPUB template generators (browser and Node.js compatible)
 *
 * Contains pure functions that produce EPUB file content as strings.
 * No Node.js or browser-specific dependencies.
 */

import { mdiToHtml, splitIntoChapters, getMdiStylesheet } from "./mdi-to-html";
import type { ExportMetadata } from "./types";

export type ChapterSplitLevel = "h1" | "h2" | "h3" | "none";

export interface EpubExportOptions {
  metadata: ExportMetadata & {
    publisher?: string;
    identifier?: string;
  };
  verticalWriting?: boolean;
  fontFamily?: string;
  textIndent?: number;
  chapterSplitLevel?: ChapterSplitLevel;
  coverImage?: Uint8Array;
  coverMediaType?: string;
}

/** Map chapter split level string to numeric value for splitIntoChapters() */
function splitLevelToNumber(level: ChapterSplitLevel | undefined): number {
  switch (level) {
    case "h1":
      return 1;
    case "h2":
      return 2;
    case "h3":
      return 3;
    case "none":
      return 0;
    default:
      return 1;
  }
}

/** Detect cover image file extension from media type */
function coverExtension(mediaType: string | undefined): string {
  if (mediaType === "image/png") return "png";
  return "jpg";
}

/** Sanitize a font-family string for safe inclusion in CSS */
function sanitizeFontFamily(raw: string): string {
  return raw.replace(/[{}<>;@\\]/g, "");
}

/**
 * Build all EPUB file entries as an ordered Map.
 *
 * The Map preserves insertion order, guaranteeing that "mimetype" is
 * always the first entry — required by the EPUB 3 specification.
 *
 * @returns Map<zip-path, string-or-binary-content>
 */
export function buildEpubFiles(
  content: string,
  options: EpubExportOptions,
): Map<string, string | Uint8Array> {
  const { metadata } = options;
  const title = metadata.title || "Untitled";
  const author = metadata.author || "";
  const language = metadata.language || "ja";
  const date = metadata.date || new Date().toISOString().split("T")[0];
  const publisher = metadata.publisher || "";
  const bookId = metadata.identifier || `illusions-${Date.now()}`;

  const verticalWriting = options.verticalWriting ?? false;
  const fontFamily = sanitizeFontFamily(options.fontFamily || "serif");
  const textIndent = options.textIndent ?? 1;
  const hasCover = options.coverImage && options.coverImage.length > 0;
  const coverExt = coverExtension(options.coverMediaType);
  const coverFileName = hasCover ? `cover.${coverExt}` : undefined;
  const coverMediaType = options.coverMediaType || "image/jpeg";

  const splitLevel = splitLevelToNumber(options.chapterSplitLevel);
  const chapters = splitIntoChapters(content, splitLevel);
  if (chapters.length === 0) {
    const html = mdiToHtml(content, { bodyOnly: true });
    chapters.push({ title, htmlContent: html, level: 1 });
  }
  // When no splitting or single untitled chapter, use the book title
  if (chapters.length === 1 && !chapters[0].title) {
    chapters[0].title = title;
  }

  // Only get base MDI rules (.mdi-tcy, ruby, etc.) — body/typesetting styles
  // are handled in generateEpubStylesheet() to avoid duplicate body blocks.
  const mdiCss = getMdiStylesheet();

  const files = new Map<string, string | Uint8Array>();

  // 1. mimetype — MUST be first entry per EPUB spec
  files.set("mimetype", "application/epub+zip");

  // 2. META-INF/container.xml
  files.set("META-INF/container.xml", generateContainerXml());

  // 3. OEBPS/content.opf
  files.set(
    "OEBPS/content.opf",
    generateContentOpf({
      title,
      author,
      language,
      date,
      bookId,
      publisher,
      chapterCount: chapters.length,
      coverFileName,
      coverMediaType,
    }),
  );

  // 4. OEBPS/toc.xhtml
  files.set("OEBPS/toc.xhtml", generateTocXhtml(title, chapters, language));

  // 5. OEBPS/style.css
  files.set(
    "OEBPS/style.css",
    generateEpubStylesheet(mdiCss, { verticalWriting, fontFamily, textIndent }),
  );

  // 6. Cover image + cover page (if provided)
  if (hasCover && coverFileName && options.coverImage) {
    files.set(`OEBPS/${coverFileName}`, options.coverImage);
    files.set("OEBPS/cover.xhtml", generateCoverXhtml(coverFileName, title, language));
  }

  // 7. Chapter XHTML files
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    files.set(
      `OEBPS/chapter-${i + 1}.xhtml`,
      generateChapterXhtml(chapter.title || `Chapter ${i + 1}`, chapter.htmlContent, language),
    );
  }

  return files;
}

// --- Template generators ---

function generateContainerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

function generateContentOpf(params: {
  title: string;
  author: string;
  language: string;
  date: string;
  bookId: string;
  publisher: string;
  chapterCount: number;
  coverFileName?: string;
  coverMediaType?: string;
}): string {
  const {
    title,
    author,
    language,
    date,
    bookId,
    publisher,
    chapterCount,
    coverFileName,
    coverMediaType,
  } = params;

  const manifestItems: string[] = [
    '    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '    <item id="style" href="style.css" media-type="text/css"/>',
  ];
  const spineItems: string[] = [];

  // Cover page + image in manifest/spine
  if (coverFileName) {
    manifestItems.push(
      `    <item id="cover-image" href="${coverFileName}" media-type="${coverMediaType || "image/jpeg"}" properties="cover-image"/>`,
    );
    manifestItems.push(
      '    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>',
    );
    spineItems.push('    <itemref idref="cover"/>');
  }

  spineItems.push('    <itemref idref="toc"/>');

  for (let i = 1; i <= chapterCount; i++) {
    manifestItems.push(
      `    <item id="chapter-${i}" href="chapter-${i}.xhtml" media-type="application/xhtml+xml"/>`,
    );
    spineItems.push(`    <itemref idref="chapter-${i}"/>`);
  }

  const modifiedTimestamp = new Date().toISOString().replace(/\.\d{3}Z/, "Z");

  const metadataLines = [
    `    <dc:identifier id="bookid">${escapeXml(bookId)}</dc:identifier>`,
    `    <dc:title>${escapeXml(title)}</dc:title>`,
    `    <dc:language>${escapeXml(language)}</dc:language>`,
    `    <dc:date>${escapeXml(date)}</dc:date>`,
  ];
  if (author) metadataLines.push(`    <dc:creator>${escapeXml(author)}</dc:creator>`);
  if (publisher) metadataLines.push(`    <dc:publisher>${escapeXml(publisher)}</dc:publisher>`);
  metadataLines.push(`    <meta property="dcterms:modified">${modifiedTimestamp}</meta>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
${metadataLines.join("\n")}
  </metadata>
  <manifest>
${manifestItems.join("\n")}
  </manifest>
  <spine>
${spineItems.join("\n")}
  </spine>
</package>`;
}

function generateTocXhtml(
  title: string,
  chapters: Array<{ title: string; level: number }>,
  language: string,
): string {
  const tocItems = chapters
    .map(
      (ch, i) =>
        `      <li><a href="chapter-${i + 1}.xhtml">${escapeXml(ch.title || `Chapter ${i + 1}`)}</a></li>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}" lang="${language}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" href="style.css"/>
</head>
<body>
  <nav epub:type="toc">
    <h1>目次</h1>
    <ol>
${tocItems}
    </ol>
  </nav>
</body>
</html>`;
}

function generateChapterXhtml(title: string, htmlContent: string, language: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${language}" lang="${language}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" href="style.css"/>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
}

function generateEpubStylesheet(
  mdiCss: string,
  opts: { verticalWriting: boolean; fontFamily: string; textIndent: number },
): string {
  const writingModeCss = opts.verticalWriting
    ? `  writing-mode: vertical-rl;\n  -webkit-writing-mode: vertical-rl;\n  -epub-writing-mode: vertical-rl;\n  text-orientation: mixed;\n`
    : "";

  return `/* EPUB base styles */
body {
  font-family: ${opts.fontFamily};
  line-height: 1.8;
  margin: 1em;
${writingModeCss}}

h1 {
  font-size: 1.5em;
  margin: 1em 0 0.5em;
  page-break-before: always;
}

h2 {
  font-size: 1.3em;
  margin: 0.8em 0 0.4em;
}

p {
  text-indent: ${opts.textIndent}em;
  margin: 0.3em 0;
}

/* MDI-specific styles */
${mdiCss}`;
}

function generateCoverXhtml(coverFileName: string, title: string, language: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${language}" lang="${language}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(title)}</title>
  <style>
    body { margin: 0; padding: 0; text-align: center; }
    img { max-width: 100%; max-height: 100%; }
  </style>
</head>
<body>
  <img src="${coverFileName}" alt="${escapeXml(title)}"/>
</body>
</html>`;
}

/**
 * Escape a string for safe inclusion in XML content
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
