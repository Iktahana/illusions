"use client";

import { useCallback, useEffect } from "react";
import { isElectronRenderer } from "@/lib/utils/runtime-env";
import { notificationManager } from "@/lib/services/notification-manager";
import { saveBlobFile } from "./save-blob-file";
import type { TxtExportFormat, TxtIndentOptions } from "./txt-exporter";
import type { SupportedFileExtension } from "@/lib/project/project-types";
import type { ExportFormat, ExportMetadata } from "./types";

interface UseExportParams {
  /** Returns the current editor content as markdown */
  getContent: () => string;
  /** Returns the document title (file name or fallback) */
  getTitle: () => string;
  /**
   * Returns the active editor tab's file type (".mdi" | ".md" | ".txt").
   * This is the source of truth for export normalization — it must NOT be
   * inferred from the display title, which is extension-stripped. Defaults
   * to ".mdi" when no editor tab is active.
   */
  getFileType: () => SupportedFileExtension;
  /** Returns true when the active tab is an editor tab.
   *  Export operations no-op when false (e.g. terminal or diff tab is active). */
  getIsEditorTabActive: () => boolean;
  /**
   * When provided, export formats with settings dialogs (PDF, DOCX) open the
   * dialog instead of exporting directly. The callback receives the format,
   * content and metadata so the parent can show the appropriate dialog
   * and later call the IPC with user-configured options.
   */
  onExportDialogRequest?: (
    format: "pdf" | "docx" | "epub",
    content: string,
    metadata: ExportMetadata,
  ) => void;
  onPrintDialogRequest?: (content: string, metadata: ExportMetadata) => void;
  /**
   * When provided, TXT / TXT(ruby) export first asks the user for 字下げ
   * (full-width-space) options via a dialog. Resolves with the chosen options,
   * or `null` if the user cancelled (export is then aborted). When omitted,
   * TXT export runs directly with no indentation (legacy behavior).
   */
  onRequestTxtExportOptions?: (format: TxtExportFormat) => Promise<TxtIndentOptions | null>;
}

/**
 * Hook that provides export functionality and registers Electron menu handlers.
 * Handles PDF, EPUB, DOCX, TXT export with progress notifications.
 */
export function useExport({
  getContent,
  getTitle,
  getFileType,
  getIsEditorTabActive,
  onExportDialogRequest,
  onPrintDialogRequest,
  onRequestTxtExportOptions,
}: UseExportParams): {
  exportAs: (format: ExportFormat) => Promise<void>;
  printDocument: () => void;
} {
  const isElectron = typeof window !== "undefined" && isElectronRenderer();

  const exportAs = useCallback(
    async (format: ExportFormat) => {
      // No-op when a non-editor tab (terminal, diff) is active
      if (!getIsEditorTabActive()) return;

      const content = getContent();
      if (!content.trim()) {
        notificationManager.warning("エクスポートするコンテンツがありません");
        return;
      }

      const title = getTitle();
      const metadata = { title, language: "ja" };

      // Source of truth for export normalization: the active tab's actual file
      // type. Must NOT be inferred from the display title, which is
      // extension-stripped (would always fall back to ".mdi" and silently drop
      // author-written \[\[blank]] / <br> literals in ".md" / ".txt" docs).
      const fileType = getFileType();

      const formatLabels: Record<ExportFormat, string> = {
        pdf: "PDF",
        epub: "EPUB",
        docx: "DOCX",
        txt: "テキスト",
        "txt-ruby": "テキスト（ルビ付き）",
        narou: "小説家になろう形式",
        kakuyomu: "カクヨム形式",
        aozora: "青空文庫形式",
      };
      const label = formatLabels[format];

      // TXT exports are client-side (no Electron IPC needed)
      if (["txt", "txt-ruby", "narou", "kakuyomu", "aozora"].includes(format)) {
        // Ask the user whether to apply full-width-space 字下げ. A null result
        // means the dialog was cancelled — abort the export silently.
        let indentOptions: TxtIndentOptions | undefined;
        if (onRequestTxtExportOptions) {
          const chosen = await onRequestTxtExportOptions(format as TxtExportFormat);
          if (chosen === null) return;
          indentOptions = chosen;
        }

        const progressId = notificationManager.showProgress(`${label}をエクスポート中...`, {
          type: "info",
        });

        try {
          if (!window.electronAPI?.renderMdiText) {
            throw new Error("Web 版では Rust MDI エクスポートを利用できません");
          }
          const converted = await window.electronAPI.renderMdiText(
            content,
            format as TxtExportFormat,
            fileType,
            indentOptions,
          );

          const baseName = title.replace(/\.(mdi|md|txt)$/i, "");
          const suffix = format === "txt" ? "" : `_${format.replace("txt-", "")}`;
          const suggestedName = `${baseName}${suffix}.txt`;

          const blob = new Blob([converted], { type: "text/plain;charset=utf-8" });
          const saved = await saveBlobFile(blob, suggestedName, isElectron, ".txt");
          notificationManager.dismiss(progressId);

          if (saved) {
            notificationManager.success(`${label}をエクスポートしました`);
          }
        } catch (error) {
          notificationManager.dismiss(progressId);
          const message = error instanceof Error ? error.message : "不明なエラー";
          notificationManager.error(`${label}のエクスポートに失敗しました: ${message}`);
        }
        return;
      }

      // PDF/DOCX/EPUB export: delegate to settings dialog when callback is provided
      if ((format === "pdf" || format === "docx" || format === "epub") && onExportDialogRequest) {
        onExportDialogRequest(format, content, metadata);
        return;
      }

      // --- Web mode: browser-side export ---
      if (!isElectron || !window.electronAPI) {
        await exportAsWeb(format, content, title, metadata, label, fileType);
        return;
      }

      // --- Electron mode: IPC-based export ---
      const progressId = notificationManager.showProgress(`${label}をエクスポート中...`, {
        type: "info",
      });

      try {
        let result: string | { success: false; error: string } | null | undefined;

        switch (format) {
          case "pdf":
            // Thread fileType so the HTML pipeline un-escapes MDI macros for
            // ".mdi" and preserves \[\[blank]] literals in ".md"/".txt".
            result = await window.electronAPI.exportPDF?.(content, {
              metadata,
              verticalWriting: false,
              pageSize: "A5",
              fileType,
            });
            break;
          case "epub":
            result = await window.electronAPI.exportEPUB?.(content, { metadata, fileType });
            break;
          case "docx":
            // Thread the active tab's file type so the main-process generateDocx
            // un-escapes macros only for ".mdi" and preserves \[\[blank]] literals
            // authored in ".md"/".txt". Otherwise the handler defaults to ".mdi".
            result = await window.electronAPI.exportDOCX?.(content, { metadata, fileType });
            break;
        }

        notificationManager.dismiss(progressId);

        if (result === null || result === undefined) {
          // User cancelled the save dialog — no notification
          return;
        }

        if (typeof result === "object" && "success" in result && !result.success) {
          notificationManager.error(`${label}のエクスポートに失敗しました: ${result.error}`);
          return;
        }

        notificationManager.success(`${label}をエクスポートしました`);
      } catch (error) {
        notificationManager.dismiss(progressId);
        const message = error instanceof Error ? error.message : "不明なエラー";
        notificationManager.error(`${label}のエクスポートに失敗しました: ${message}`);
      }
    },
    [
      getContent,
      getTitle,
      getFileType,
      getIsEditorTabActive,
      isElectron,
      onExportDialogRequest,
      onRequestTxtExportOptions,
    ],
  );

  const printDocument = useCallback(() => {
    if (!getIsEditorTabActive()) return;
    const content = getContent();
    if (!content.trim()) {
      notificationManager.warning("印刷するコンテンツがありません");
      return;
    }
    const title = getTitle();
    const metadata = { title, language: "ja" };
    onPrintDialogRequest?.(content, metadata);
  }, [getContent, getTitle, getIsEditorTabActive, onPrintDialogRequest]);

  // Register Electron menu event handlers
  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;

    const cleanups: Array<(() => void) | void> = [];

    if (window.electronAPI.onMenuExportTxt) {
      cleanups.push(window.electronAPI.onMenuExportTxt(() => void exportAs("txt")));
    }
    if (window.electronAPI.onMenuExportTxtRuby) {
      cleanups.push(window.electronAPI.onMenuExportTxtRuby(() => void exportAs("txt-ruby")));
    }
    if (window.electronAPI.onMenuExportNarou) {
      cleanups.push(window.electronAPI.onMenuExportNarou(() => void exportAs("narou")));
    }
    if (window.electronAPI.onMenuExportKakuyomu) {
      cleanups.push(window.electronAPI.onMenuExportKakuyomu(() => void exportAs("kakuyomu")));
    }
    if (window.electronAPI.onMenuExportAozora) {
      cleanups.push(window.electronAPI.onMenuExportAozora(() => void exportAs("aozora")));
    }
    if (window.electronAPI.onMenuExportPDF) {
      cleanups.push(window.electronAPI.onMenuExportPDF(() => void exportAs("pdf")));
    }
    if (window.electronAPI.onMenuExportEPUB) {
      cleanups.push(window.electronAPI.onMenuExportEPUB(() => void exportAs("epub")));
    }
    if (window.electronAPI.onMenuExportDOCX) {
      cleanups.push(window.electronAPI.onMenuExportDOCX(() => void exportAs("docx")));
    }
    if (window.electronAPI.onMenuPrint) {
      cleanups.push(window.electronAPI.onMenuPrint(() => printDocument()));
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup?.();
      }
    };
  }, [isElectron, exportAs, printDocument]);

  return { exportAs, printDocument };
}

/**
 * Browser-side export for PDF, EPUB, DOCX.
 *
 * PDF: Opens a print dialog. window.open() is called synchronously within the
 * user gesture to avoid popup blocker. The popup closes automatically on afterprint.
 *
 * DOCX/EPUB: Uses dynamic imports to load the browser-compatible exporters,
 * then triggers a file download via saveBlobFile().
 */
async function exportAsWeb(
  format: ExportFormat,
  content: string,
  title: string,
  metadata: ExportMetadata,
  label: string,
  fileType: string = ".mdi",
): Promise<void> {
  void format;
  void content;
  void title;
  void metadata;
  void label;
  void fileType;
  notificationManager.warning("Web 版では Rust MDI エクスポートを利用できません");
}
