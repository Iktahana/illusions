/**
 * Shared types for export module
 */

export interface ExportMetadata {
  title: string;
  author?: string;
  date?: string;
  language?: string; // default: 'ja'
}

export interface ExportOptions {
  metadata: ExportMetadata;
  verticalWriting?: boolean;
  includeTableOfContents?: boolean;
}

/** Shared options for PDF generation IPCs (exportPDF, generatePdfPreview). */
export interface PdfGenerationOptions {
  metadata: ExportMetadata;
  verticalWriting?: boolean;
  pageSize?: string;
  landscape?: boolean;
  margins?: { top: number; bottom: number; left: number; right: number };
  charsPerLine?: number;
  linesPerPage?: number;
  fontFamily?: string;
  showPageNumbers?: boolean;
  pageNumberFormat?: "simple" | "dash" | "fraction";
  pageNumberPosition?:
    "bottom-left" | "bottom-center" | "bottom-right" | "top-left" | "top-center" | "top-right";
  textIndent?: number;
  /** Render 字下げ as literal full-width spaces (U+3000) instead of CSS text-indent. */
  fullwidthSpaceIndent?: boolean;
  /** Google Font family name for PDF export (triggers <link> injection and CSP relaxation) */
  googleFontFamily?: string;
  /**
   * Active document file type. The HTML pipeline un-escapes MDI macros only for
   * ".mdi"; ".md"/".txt" preserve authored `\[\[blank]]` literals. Absent → ".mdi".
   */
  fileType?: string;
}

export type ExportFormat =
  "pdf" | "epub" | "docx" | "txt" | "txt-ruby" | "narou" | "kakuyomu" | "aozora";

export interface Chapter {
  title: string;
  htmlContent: string;
  level: number;
}
