"use client";

import { useCallback, useEffect } from "react";
import {
  trackDocumentOutputResult,
  type OutputOperation,
  type OutputResult,
} from "@/lib/analytics/document-output-events";
import { trackNoteOutputResult } from "@/lib/analytics/note-output-events";
import { notificationManager } from "@/lib/services/notification-manager";
import type { TxtExportFormat, TxtIndentOptions } from "./txt-export-types";
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
    format: "html" | "pdf" | "docx" | "epub",
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
  onRequestTxtExportOptions?: (
    format: TxtExportFormat,
    operation: "export" | "copy",
  ) => Promise<TxtIndentOptions | null>;
}

const TXT_EXPORT_FORMATS: readonly TxtExportFormat[] = [
  "txt",
  "txt-ruby",
  "narou",
  "kakuyomu",
  "aozora",
  "note",
];

const TXT_FORMAT_LABELS: Record<TxtExportFormat, string> = {
  txt: "テキスト（プレーン）",
  "txt-ruby": "テキスト（ルビ付き）",
  narou: "小説家になろう形式",
  kakuyomu: "カクヨム形式",
  aozora: "青空文庫形式",
  note: "note形式",
};

function trackOutputResult(
  operation: OutputOperation,
  format: ExportFormat,
  result: OutputResult,
): void {
  if (format === "note") {
    trackNoteOutputResult(operation, result);
    return;
  }

  trackDocumentOutputResult(operation, format, result);
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
  copyAs: (format: TxtExportFormat) => Promise<void>;
  printDocument: () => void;
} {
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
        html: "HTML",
        pdf: "PDF",
        epub: "EPUB",
        docx: "DOCX",
        txt: "テキスト",
        "txt-ruby": "テキスト（ルビ付き）",
        narou: "小説家になろう形式",
        kakuyomu: "カクヨム形式",
        aozora: "青空文庫形式",
        note: "note形式",
      };
      const label = formatLabels[format];

      // TXT exports use the Rust renderer and native save dialog in Electron main.
      if (TXT_EXPORT_FORMATS.includes(format as TxtExportFormat)) {
        // Ask the user whether to apply full-width-space 字下げ. A null result
        // means the dialog was cancelled — abort the export silently.
        let indentOptions: TxtIndentOptions | undefined;
        if (onRequestTxtExportOptions) {
          const chosen = await onRequestTxtExportOptions(format as TxtExportFormat, "export");
          if (chosen === null) return;
          indentOptions = chosen;
        }

        const progressId = notificationManager.showProgress(`${label}をエクスポート中...`, {
          type: "info",
        });

        try {
          if (!window.electronAPI?.exportMdiText) {
            throw new Error("エクスポート機能を利用できません。アプリを再起動してください");
          }
          const result = await window.electronAPI.exportMdiText(
            content,
            format as TxtExportFormat,
            fileType,
            indentOptions,
            title,
          );
          trackOutputResult("export", format, result);
          notificationManager.dismiss(progressId);

          if (result === null || result === undefined) return;
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
        return;
      }

      // Configured exports delegate to the shared settings/preview dialog.
      if (
        (format === "html" || format === "pdf" || format === "docx" || format === "epub") &&
        onExportDialogRequest
      ) {
        onExportDialogRequest(format, content, metadata);
        return;
      }

      if (!window.electronAPI) {
        notificationManager.error("エクスポート機能を利用できません。アプリを再起動してください");
        return;
      }

      // --- Electron mode: IPC-based export ---
      const progressId = notificationManager.showProgress(`${label}をエクスポート中...`, {
        type: "info",
      });

      try {
        let result: string | { success: false; error: string } | null | undefined;

        switch (format) {
          case "html":
            result = await window.electronAPI.exportHTML?.(content, fileType, title);
            break;
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

        trackOutputResult("export", format, result);
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
      onExportDialogRequest,
      onRequestTxtExportOptions,
    ],
  );

  const copyAs = useCallback(
    async (format: TxtExportFormat) => {
      if (!getIsEditorTabActive()) return;

      const content = getContent();
      if (!content.trim()) {
        notificationManager.warning("コピーするコンテンツがありません");
        return;
      }

      let indentOptions: TxtIndentOptions | undefined;
      if (onRequestTxtExportOptions) {
        const chosen = await onRequestTxtExportOptions(format, "copy");
        if (chosen === null) return;
        indentOptions = chosen;
      }

      const label = TXT_FORMAT_LABELS[format];
      const progressId = notificationManager.showProgress(`${label}を変換中...`, {
        type: "info",
      });

      try {
        if (!window.electronAPI?.copyMdiText) {
          throw new Error("クリップボード機能を利用できません。アプリを再起動してください");
        }
        const result = await window.electronAPI.copyMdiText(
          content,
          format,
          getFileType(),
          indentOptions,
        );
        trackOutputResult("copy", format, result);
        notificationManager.dismiss(progressId);

        if (!result.success) {
          notificationManager.error(
            `${label}のクリップボードへのコピーに失敗しました: ${result.error}`,
          );
          return;
        }
        notificationManager.success(`${label}をクリップボードにコピーしました`);
      } catch (error) {
        notificationManager.dismiss(progressId);
        const message = error instanceof Error ? error.message : "不明なエラー";
        notificationManager.error(`${label}のクリップボードへのコピーに失敗しました: ${message}`);
      }
    },
    [getContent, getFileType, getIsEditorTabActive, onRequestTxtExportOptions],
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
    if (!window.electronAPI) return;

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
    if (window.electronAPI.onMenuExportNote) {
      cleanups.push(window.electronAPI.onMenuExportNote(() => void exportAs("note")));
    }
    if (window.electronAPI.onMenuExportHTML) {
      cleanups.push(window.electronAPI.onMenuExportHTML(() => void exportAs("html")));
    }
    if (window.electronAPI.onMenuCopyTxt) {
      cleanups.push(window.electronAPI.onMenuCopyTxt(() => void copyAs("txt")));
    }
    if (window.electronAPI.onMenuCopyTxtRuby) {
      cleanups.push(window.electronAPI.onMenuCopyTxtRuby(() => void copyAs("txt-ruby")));
    }
    if (window.electronAPI.onMenuCopyNarou) {
      cleanups.push(window.electronAPI.onMenuCopyNarou(() => void copyAs("narou")));
    }
    if (window.electronAPI.onMenuCopyKakuyomu) {
      cleanups.push(window.electronAPI.onMenuCopyKakuyomu(() => void copyAs("kakuyomu")));
    }
    if (window.electronAPI.onMenuCopyAozora) {
      cleanups.push(window.electronAPI.onMenuCopyAozora(() => void copyAs("aozora")));
    }
    if (window.electronAPI.onMenuCopyNote) {
      cleanups.push(window.electronAPI.onMenuCopyNote(() => void copyAs("note")));
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
  }, [copyAs, exportAs, printDocument]);

  return { exportAs, copyAs, printDocument };
}
