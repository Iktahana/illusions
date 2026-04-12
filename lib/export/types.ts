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
  pageSize?: "A4" | "A5" | "B5" | "B6";
  landscape?: boolean;
  margins?: { top: number; bottom: number; left: number; right: number };
  charsPerLine?: number;
  linesPerPage?: number;
  fontFamily?: string;
  showPageNumbers?: boolean;
  pageNumberFormat?: "simple" | "dash" | "fraction";
  pageNumberPosition?:
    | "bottom-left"
    | "bottom-center"
    | "bottom-right"
    | "top-left"
    | "top-center"
    | "top-right";
  textIndent?: number;
  /** Google Font family name for PDF export (triggers <link> injection and CSP relaxation) */
  googleFontFamily?: string;
}

export type ExportFormat = "pdf" | "epub" | "docx" | "txt" | "txt-ruby";

export interface Chapter {
  title: string;
  htmlContent: string;
  level: number;
}
