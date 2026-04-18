/**
 * DOCX exporter for MDI content
 *
 * Generates a Word document from MDI markdown using the docx library.
 * Handles headings, paragraphs, bold, italic, and ruby (as parenthesized fallback).
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Footer,
  Header,
  PageNumber,
  TextDirection,
} from "docx";
import type { ExportMetadata } from "./types";
import { replaceMdiWithRubyText, MDI_BREAK_RE } from "./mdi-parser";
import {
  DEFAULT_DOCX_SETTINGS,
  PAGE_DIMENSIONS,
  toDocxFont,
  mmToTwips,
  emToTwips,
  ptToHalfPoints,
  lineSpacingToTwips,
  sanitizeSettings,
} from "./docx-export-settings";

import type { DocxExportSettings, DocxFontConfig } from "./docx-export-settings";

export interface DocxExportOptions {
  metadata: ExportMetadata;
  settings?: DocxExportSettings;
}

/**
 * Build a DOCX Document object from MDI markdown content.
 * Shared between generateDocx() and generateDocxBlob().
 */
function buildDocxDocument(content: string, options: DocxExportOptions): Document {
  const { metadata } = options;
  const settings = options.settings ? sanitizeSettings(options.settings) : DEFAULT_DOCX_SETTINGS;
  const fontConfig = toDocxFont(settings.fontFamily);
  const paragraphs = parseMarkdownToDocxParagraphs(content, settings, fontConfig);

  // Page dimensions (swap for landscape)
  const baseDims = PAGE_DIMENSIONS[settings.pageSize] ?? PAGE_DIMENSIONS["A5"];
  const pageWidth = settings.landscape ? baseDims.height : baseDims.width;
  const pageHeight = settings.landscape ? baseDims.width : baseDims.height;

  // Page number header/footer
  let headers: { default: Header } | undefined;
  let footers: { default: Footer } | undefined;

  if (settings.showPageNumbers) {
    const format = settings.pageNumberFormat ?? "simple";
    const position = settings.pageNumberPosition ?? "bottom-center";

    // Determine alignment
    const alignMap: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
      left: AlignmentType.LEFT,
      center: AlignmentType.CENTER,
      right: AlignmentType.RIGHT,
    };
    const alignKey = position.endsWith("-left")
      ? "left"
      : position.endsWith("-right")
        ? "right"
        : "center";
    const alignment = alignMap[alignKey];

    // Build page number content based on format
    const runSize = ptToHalfPoints(settings.fontSize - 2);
    const children: TextRun[] = [];
    switch (format) {
      case "dash":
        children.push(
          new TextRun({ text: "- ", font: fontConfig, size: runSize }),
          new TextRun({ children: [PageNumber.CURRENT], font: fontConfig, size: runSize }),
          new TextRun({ text: " -", font: fontConfig, size: runSize }),
        );
        break;
      case "fraction":
        children.push(
          new TextRun({ children: [PageNumber.CURRENT], font: fontConfig, size: runSize }),
          new TextRun({ text: " / ", font: fontConfig, size: runSize }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: fontConfig, size: runSize }),
        );
        break;
      default:
        children.push(
          new TextRun({ children: [PageNumber.CURRENT], font: fontConfig, size: runSize }),
        );
        break;
    }

    const paragraph = new Paragraph({ alignment, children });

    if (position.startsWith("top-")) {
      headers = { default: new Header({ children: [paragraph] }) };
    } else {
      footers = { default: new Footer({ children: [paragraph] }) };
    }
  }

  return new Document({
    creator: metadata.author || "",
    title: metadata.title || "",
    description: "",
    styles: {
      default: {
        document: {
          run: {
            font: fontConfig,
            size: ptToHalfPoints(settings.fontSize),
          },
          paragraph: {
            spacing: { line: lineSpacingToTwips(settings.lineSpacing) },
          },
        },
      },
    },
    sections: [
      {
        ...(headers ? { headers } : {}),
        ...(footers ? { footers } : {}),
        properties: {
          page: {
            size: {
              width: mmToTwips(pageWidth),
              height: mmToTwips(pageHeight),
            },
            margin: {
              top: mmToTwips(settings.margins.top),
              bottom: mmToTwips(settings.margins.bottom),
              left: mmToTwips(settings.margins.left),
              right: mmToTwips(settings.margins.right),
            },
            ...(settings.showPageNumbers ? { pageNumbers: { start: 1 } } : {}),
            ...(settings.verticalWriting
              ? { textDirection: TextDirection.TOP_TO_BOTTOM_RIGHT_TO_LEFT }
              : {}),
          },
        },
        children: paragraphs,
      },
    ],
  });
}

/**
 * Generate a DOCX buffer from MDI markdown content (Node.js / Electron).
 *
 * @param content - MDI markdown content
 * @param options - DOCX export options
 * @returns DOCX data as a Buffer
 */
export async function generateDocx(content: string, options: DocxExportOptions): Promise<Buffer> {
  const doc = buildDocxDocument(content, options);
  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

/**
 * Generate a DOCX Blob from MDI markdown content (browser).
 *
 * @param content - MDI markdown content
 * @param options - DOCX export options
 * @returns DOCX data as a Blob
 */
export async function generateDocxBlob(content: string, options: DocxExportOptions): Promise<Blob> {
  const doc = buildDocxDocument(content, options);
  return Packer.toBlob(doc);
}

// --- Markdown parser ---

/**
 * Parse MDI markdown content into docx Paragraph objects
 */
function parseMarkdownToDocxParagraphs(
  content: string,
  settings: DocxExportSettings,
  fontConfig: DocxFontConfig,
): Paragraph[] {
  const lines = content.split("\n");
  const paragraphs: Paragraph[] = [];
  let currentParagraphLines: string[] = [];

  const flushParagraph = (): void => {
    if (currentParagraphLines.length === 0) return;
    const text = currentParagraphLines.join("\n").trim();
    if (text) {
      paragraphs.push(createParagraph(text, settings, fontConfig));
    }
    currentParagraphLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty line = paragraph break
    if (trimmed === "") {
      flushParagraph();
      continue;
    }

    // Heading detection
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      paragraphs.push(createHeading(headingText, level, fontConfig));
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      paragraphs.push(
        new Paragraph({
          spacing: { before: 200, after: 200 },
          children: [
            new TextRun({
              text: "\uFF0A\u3000\uFF0A\u3000\uFF0A",
              font: fontConfig,
            }),
          ],
          alignment: AlignmentType.CENTER,
        }),
      );
      continue;
    }

    currentParagraphLines.push(trimmed);
  }

  flushParagraph();
  return paragraphs;
}

/**
 * Create a heading paragraph
 */
function createHeading(text: string, level: number, fontConfig: DocxFontConfig): Paragraph {
  const headingLevels: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
    5: HeadingLevel.HEADING_5,
    6: HeadingLevel.HEADING_6,
  };

  return new Paragraph({
    heading: headingLevels[level] || HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    children: parseInlineFormatting(text, fontConfig),
  });
}

/**
 * Create a body paragraph with inline formatting
 */
function createParagraph(
  text: string,
  settings: DocxExportSettings,
  fontConfig: DocxFontConfig,
): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 120 },
    indent: { firstLine: emToTwips(settings.textIndent, settings.fontSize) },
    children: parseInlineFormatting(text, fontConfig),
  });
}

/**
 * Sentinel used to preserve `[[br]]` through replaceMdiWithRubyText without
 * colliding with CommonMark softbreak newlines that originate from paragraph
 * line-wrapping. Uses U+E001 (Unicode Private Use Area) which will not appear
 * in user content and survives the generic MDI text transform.
 */
const DOCX_MDI_BREAK_SENTINEL = "\uE001";

/**
 * Push a text span as TextRuns, splitting on the MDI break sentinel and
 * inserting `TextRun({ break: 1 })` at each boundary. Empty segments are
 * skipped. CommonMark softbreaks (literal `\n`) are preserved as text and
 * are NOT treated as explicit breaks.
 */
function pushRunWithBreaks(
  runs: TextRun[],
  text: string,
  props: { bold?: boolean; italics?: boolean; font: DocxFontConfig },
): void {
  const parts = text.split(DOCX_MDI_BREAK_SENTINEL);
  parts.forEach((part, i) => {
    if (i > 0) {
      runs.push(new TextRun({ break: 1, font: props.font }));
    }
    if (part) {
      runs.push(new TextRun({ text: part, ...props }));
    }
  });
}

/**
 * Parse inline markdown/MDI formatting into TextRun objects
 *
 * Handles: **bold**, *italic*, {ruby|text}, ^tcy^, [[no-break:text]],
 * [[kern:val:text]], [[br]] (as `<w:br/>`)
 */
function parseInlineFormatting(text: string, fontConfig: DocxFontConfig): TextRun[] {
  const runs: TextRun[] = [];

  // Reserve `[[br]]` with a sentinel before the shared parser so that it is
  // distinguishable from CommonMark softbreak newlines. replaceMdiWithRubyText
  // otherwise converts `[[br]]` to `\n`, which would be indistinguishable from
  // paragraph line-wrap newlines for the purpose of emitting `<w:br/>`.
  const reserved = text.replace(MDI_BREAK_RE, DOCX_MDI_BREAK_SENTINEL);
  const processed = replaceMdiWithRubyText(reserved);

  // Now parse bold/italic markdown
  // Split by bold-italic (***text***), bold (**text**), and italic (*text*) markers
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(processed)) !== null) {
    if (match.index > lastIndex) {
      const before = processed.slice(lastIndex, match.index);
      if (before) {
        pushRunWithBreaks(runs, before, { font: fontConfig });
      }
    }

    if (match[2]) {
      pushRunWithBreaks(runs, match[2], { bold: true, italics: true, font: fontConfig });
    } else if (match[3]) {
      pushRunWithBreaks(runs, match[3], { bold: true, font: fontConfig });
    } else if (match[4]) {
      pushRunWithBreaks(runs, match[4], { italics: true, font: fontConfig });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < processed.length) {
    const remaining = processed.slice(lastIndex);
    if (remaining) {
      pushRunWithBreaks(runs, remaining, { font: fontConfig });
    }
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text: processed, font: fontConfig }));
  }

  return runs;
}
