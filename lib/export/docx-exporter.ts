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
  PageNumber,
} from "docx";
import type { ExportMetadata } from "./types";
import { replaceMdiWithRubyText } from "./mdi-parser";
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

  // Footer with centered page number
  const footers = settings.showPageNumbers
    ? {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: fontConfig,
                  size: ptToHalfPoints(settings.fontSize - 2),
                }),
              ],
            }),
          ],
        }),
      }
    : undefined;

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
 * Parse inline markdown/MDI formatting into TextRun objects
 *
 * Handles: **bold**, *italic*, {ruby|text}, ^tcy^, [[no-break:text]], [[kern:val:text]]
 */
function parseInlineFormatting(text: string, fontConfig: DocxFontConfig): TextRun[] {
  const runs: TextRun[] = [];

  // Process all MDI inline syntax via shared parser (ruby → fullwidth parens)
  const processed = replaceMdiWithRubyText(text);

  // Now parse bold/italic markdown
  // Split by bold-italic (***text***), bold (**text**), and italic (*text*) markers
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(processed)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      const before = processed.slice(lastIndex, match.index);
      if (before) {
        runs.push(new TextRun({ text: before, font: fontConfig }));
      }
    }

    if (match[2]) {
      // Bold italic: ***text***
      runs.push(new TextRun({ text: match[2], bold: true, italics: true, font: fontConfig }));
    } else if (match[3]) {
      // Bold: **text**
      runs.push(new TextRun({ text: match[3], bold: true, font: fontConfig }));
    } else if (match[4]) {
      // Italic: *text*
      runs.push(new TextRun({ text: match[4], italics: true, font: fontConfig }));
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < processed.length) {
    const remaining = processed.slice(lastIndex);
    if (remaining) {
      runs.push(new TextRun({ text: remaining, font: fontConfig }));
    }
  }

  // If no runs were created, add the full text
  if (runs.length === 0) {
    runs.push(new TextRun({ text: processed, font: fontConfig }));
  }

  return runs;
}
