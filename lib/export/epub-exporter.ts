/**
 * EPUB 3 exporter for MDI content
 *
 * Generates a standards-compliant EPUB 3 file from MDI markdown.
 * EPUB is a ZIP archive containing XHTML content documents,
 * metadata (OPF), navigation (TOC), and stylesheets.
 */

import archiver from "archiver";
import { PassThrough } from "node:stream";

import { mdiToHtml, splitIntoChapters, getMdiStylesheet } from "./mdi-to-html";
import type { ExportMetadata } from "./types";

export interface EpubExportOptions {
  metadata: ExportMetadata;
}

/**
 * Generate an EPUB buffer from MDI markdown content.
 *
 * @param content - MDI markdown content
 * @param options - EPUB export options
 * @returns EPUB data as a Buffer
 */
export async function generateEpub(
  content: string,
  options: EpubExportOptions
): Promise<Buffer> {
  const { metadata } = options;
  const title = metadata.title || "Untitled";
  const author = metadata.author || "";
  const language = metadata.language || "ja";
  const date = metadata.date || new Date().toISOString().split("T")[0];
  const bookId = `illusions-${Date.now()}`;

  // Split content into chapters
  const chapters = splitIntoChapters(content);

  // If no chapters found, treat entire content as one chapter
  if (chapters.length === 0) {
    const html = mdiToHtml(content, { bodyOnly: true });
    chapters.push({ title: title, htmlContent: html, level: 1 });
  }

  // Get stylesheet
  const stylesheet = getMdiStylesheet();

  // Create ZIP archive
  const archive = archiver("zip", { zlib: { level: 9 } });
  const buffers: Buffer[] = [];
  const passThrough = new PassThrough();

  passThrough.on("data", (chunk: Buffer) => buffers.push(chunk));
  archive.pipe(passThrough);

  // 1. mimetype (must be first entry, stored uncompressed per EPUB spec)
  archive.append("application/epub+zip", {
    name: "mimetype",
    store: true,
  });

  // 2. META-INF/container.xml
  archive.append(generateContainerXml(), { name: "META-INF/container.xml" });

  // 3. OEBPS/content.opf (package document)
  archive.append(
    generateContentOpf({
      title,
      author,
      language,
      date,
      bookId,
      chapterCount: chapters.length,
    }),
    { name: "OEBPS/content.opf" }
  );

  // 4. OEBPS/toc.xhtml (navigation document)
  archive.append(generateTocXhtml(title, chapters), {
    name: "OEBPS/toc.xhtml",
  });

  // 5. OEBPS/style.css
  archive.append(generateEpubStylesheet(stylesheet), {
    name: "OEBPS/style.css",
  });

  // 6. Chapter XHTML files
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    archive.append(
      generateChapterXhtml(
        chapter.title || `Chapter ${i + 1}`,
        chapter.htmlContent,
        language
      ),
      { name: `OEBPS/chapter-${i + 1}.xhtml` }
    );
  }

  // Finalize the archive
  await archive.finalize();

  // Wait for all data to be flushed through the stream
  await new Promise<void>((resolve, reject) => {
    passThrough.on("end", resolve);
    passThrough.on("error", reject);
  });

  return Buffer.concat(buffers);
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
      `    <item id="chapter-${i}" href="chapter-${i}.xhtml" media-type="application/xhtml+xml"/>`
    );
    spineItems.push(`    <itemref idref="chapter-${i}"/>`);
  }

  const modifiedTimestamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z/, "Z");

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
  chapters: Array<{ title: string; level: number }>
): string {
  const tocItems = chapters
    .map(
      (ch, i) =>
        `      <li><a href="chapter-${i + 1}.xhtml">${escapeXml(ch.title || `Chapter ${i + 1}`)}</a></li>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" lang="ja">
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

function generateChapterXhtml(
  title: string,
  htmlContent: string,
  language: string
): string {
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
