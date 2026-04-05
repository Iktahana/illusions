/**
 * Shared EPUB template generators (browser and Node.js compatible)
 *
 * Contains pure functions that produce EPUB file content as strings.
 * No Node.js or browser-specific dependencies.
 */

import { mdiToHtml, splitIntoChapters, getMdiStylesheet } from "./mdi-to-html";
import type { ExportMetadata } from "./types";

export interface EpubExportOptions {
  metadata: ExportMetadata;
}

/**
 * Build all EPUB file entries as an ordered Map.
 *
 * The Map preserves insertion order, guaranteeing that "mimetype" is
 * always the first entry — required by the EPUB 3 specification.
 *
 * @returns Map<zip-path, string-content>
 */
export function buildEpubFiles(content: string, options: EpubExportOptions): Map<string, string> {
  const { metadata } = options;
  const title = metadata.title || "Untitled";
  const author = metadata.author || "";
  const language = metadata.language || "ja";
  const date = metadata.date || new Date().toISOString().split("T")[0];
  const bookId = `illusions-${Date.now()}`;

  const chapters = splitIntoChapters(content);
  if (chapters.length === 0) {
    const html = mdiToHtml(content, { bodyOnly: true });
    chapters.push({ title, htmlContent: html, level: 1 });
  }

  const stylesheet = getMdiStylesheet();

  const files = new Map<string, string>();

  // 1. mimetype — MUST be first entry per EPUB spec
  files.set("mimetype", "application/epub+zip");

  // 2. META-INF/container.xml
  files.set("META-INF/container.xml", generateContainerXml());

  // 3. OEBPS/content.opf
  files.set(
    "OEBPS/content.opf",
    generateContentOpf({ title, author, language, date, bookId, chapterCount: chapters.length }),
  );

  // 4. OEBPS/toc.xhtml
  files.set("OEBPS/toc.xhtml", generateTocXhtml(title, chapters, language));

  // 5. OEBPS/style.css
  files.set("OEBPS/style.css", generateEpubStylesheet(stylesheet));

  // 6. Chapter XHTML files
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
  chapterCount: number;
}): string {
  const { title, author, language, date, bookId, chapterCount } = params;

  const manifestItems: string[] = [
    '    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '    <item id="style" href="style.css" media-type="text/css"/>',
  ];
  const spineItems: string[] = ['    <itemref idref="toc"/>'];

  for (let i = 1; i <= chapterCount; i++) {
    manifestItems.push(
      `    <item id="chapter-${i}" href="chapter-${i}.xhtml" media-type="application/xhtml+xml"/>`,
    );
    spineItems.push(`    <itemref idref="chapter-${i}"/>`);
  }

  const modifiedTimestamp = new Date().toISOString().replace(/\.\d{3}Z/, "Z");

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(bookId)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>${escapeXml(language)}</dc:language>
    <dc:date>${escapeXml(date)}</dc:date>${author ? `\n    <dc:creator>${escapeXml(author)}</dc:creator>` : ""}
    <meta property="dcterms:modified">${modifiedTimestamp}</meta>
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

function generateEpubStylesheet(mdiCss: string): string {
  return `/* EPUB base styles */
body {
  font-family: serif;
  line-height: 1.8;
  margin: 1em;
}

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
  text-indent: 1em;
  margin: 0.3em 0;
}

/* MDI-specific styles */
${mdiCss}`;
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
