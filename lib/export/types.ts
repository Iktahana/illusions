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

export type ExportFormat = "pdf" | "epub" | "docx" | "txt" | "txt-ruby";

export interface Chapter {
  title: string;
  htmlContent: string;
  level: number;
}
