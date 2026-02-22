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
} from 'docx';
import type { ExportMetadata } from './types';

export interface DocxExportOptions {
  metadata: ExportMetadata;
}

/**
 * Generate a DOCX buffer from MDI markdown content.
 *
 * @param content - MDI markdown content
 * @param options - DOCX export options
 * @returns DOCX data as a Buffer
 */
export async function generateDocx(
  content: string,
  options: DocxExportOptions
): Promise<Buffer> {
  const { metadata } = options;
  const paragraphs = parseMarkdownToDocxParagraphs(content);

  const doc = new Document({
    creator: metadata.author || '',
    title: metadata.title || '',
    description: '',
    styles: {
      default: {
        document: {
          run: {
            font: 'Yu Mincho',
            size: 24, // 12pt in half-points
          },
          paragraph: {
            spacing: { line: 360 }, // 1.5x line spacing
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 10206, // A5 width in twips (148mm)
              height: 14400, // A5 height in twips
            },
            margin: {
              top: 1134, // ~20mm
              bottom: 1134,
              left: 1134,
              right: 1134,
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

// --- Markdown parser ---

/**
 * Parse MDI markdown content into docx Paragraph objects
 */
function parseMarkdownToDocxParagraphs(content: string): Paragraph[] {
  const lines = content.split('\n');
  const paragraphs: Paragraph[] = [];
  let currentParagraphLines: string[] = [];

  const flushParagraph = (): void => {
    if (currentParagraphLines.length === 0) return;
    const text = currentParagraphLines.join('\n').trim();
    if (text) {
      paragraphs.push(createParagraph(text));
    }
    currentParagraphLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty line = paragraph break
    if (trimmed === '') {
      flushParagraph();
      continue;
    }

    // Heading detection
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      paragraphs.push(createHeading(headingText, level));
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      // Add a centered separator for horizontal rules
      paragraphs.push(
        new Paragraph({
          spacing: { before: 200, after: 200 },
          children: [
            new TextRun({
              text: '\uFF0A\u3000\uFF0A\u3000\uFF0A',
              font: 'Yu Mincho',
            }),
          ],
          alignment: AlignmentType.CENTER,
        })
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
function createHeading(text: string, level: number): Paragraph {
  const headingLevels: Record<
    number,
    (typeof HeadingLevel)[keyof typeof HeadingLevel]
  > = {
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
    children: parseInlineFormatting(text),
  });
}

/**
 * Create a body paragraph with inline formatting
 */
function createParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 120 },
    indent: { firstLine: 480 }, // ~1em indent for Japanese prose
    children: parseInlineFormatting(text),
  });
}

/**
 * Parse inline markdown/MDI formatting into TextRun objects
 *
 * Handles: **bold**, *italic*, {ruby|text}, ^tcy^, [[no-break:text]], [[kern:val:text]]
 */
function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];

  // Process MDI ruby: {base|ruby} -> base(ruby)
  let processed = text.replace(
    /\{([^|{}]+)\|([^}]+)\}/g,
    (_match, base: string, ruby: string) => {
      const cleanRuby = ruby.replace(/\./g, '');
      return `${base}\uFF08${cleanRuby}\uFF09`;
    }
  );

  // Process tate-chu-yoko: ^text^ -> text (just remove markers in DOCX)
  processed = processed.replace(/\^([^^]+)\^/g, '$1');

  // Process no-break: [[no-break:text]] -> text
  processed = processed.replace(/\[\[no-break:([^\]]+)\]\]/g, '$1');

  // Process kerning: [[kern:val:text]] -> text
  processed = processed.replace(/\[\[kern:[^:\]]+:([^\]]+)\]\]/g, '$1');

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
        runs.push(new TextRun({ text: before }));
      }
    }

    if (match[2]) {
      // Bold italic: ***text***
      runs.push(new TextRun({ text: match[2], bold: true, italics: true }));
    } else if (match[3]) {
      // Bold: **text**
      runs.push(new TextRun({ text: match[3], bold: true }));
    } else if (match[4]) {
      // Italic: *text*
      runs.push(new TextRun({ text: match[4], italics: true }));
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < processed.length) {
    const remaining = processed.slice(lastIndex);
    if (remaining) {
      runs.push(new TextRun({ text: remaining }));
    }
  }

  // If no runs were created, add the full text
  if (runs.length === 0) {
    runs.push(new TextRun({ text: processed }));
  }

  return runs;
}
