"use client";

import { useCallback, useEffect } from "react";
import { isElectronRenderer } from "@/lib/utils/runtime-env";
import { notificationManager } from "@/lib/services/notification-manager";
import { mdiToPlainText, mdiToRubyText } from "./txt-exporter";
import type { ExportFormat, ExportMetadata } from "./types";

interface UseExportParams {
  /** Returns the current editor content as markdown */
  getContent: () => string;
  /** Returns the document title (file name or fallback) */
  getTitle: () => string;
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
    format: "pdf" | "docx",
    content: string,
    metadata: ExportMetadata,
  ) => void;
}

/**
 * Save a Blob to a file.
 *
 * In Electron, uses the native save dialog via the existing `saveFile` IPC
 * channel (filePath = null triggers dialog.showSaveDialog in the main process).
 * This avoids the user-gesture requirement of showSaveFilePicker, which causes
 * a DOMException when the export is triggered from the application menu over IPC.
 *
 * In web browsers, uses the File System Access API when available (Chromium),
 * and falls back to a Blob URL download for other browsers.
 *
 * @param blob - Blob content to write
 * @param suggestedName - Default file name shown in the save dialog
 * @param accept - MIME type → extensions map for the file picker
 * @param isElectron - True when running inside Electron renderer
 * @param electronExt - File extension for Electron save dialog. Currently only
 *   ".txt" is routed through Electron IPC here; DOCX/EPUB/PDF use dedicated
 *   IPC export handlers and never reach this function in Electron mode.
 */
async function saveBlobFile(
  blob: Blob,
  suggestedName: string,
  accept: Record<string, string[]>,
  isElectron: boolean,
  electronExt?: string,
): Promise<boolean> {
  // Electron: delegate to main-process IPC (currently only TXT is routed here;
  // other formats use dedicated IPC export handlers)
  if (isElectron && window.electronAPI && electronExt === ".txt") {
    const text = await blob.text();
    const result = await window.electronAPI.saveFile(null, text, electronExt);
    if (result === null) return false;
    if (typeof result === "object" && "success" in result && !result.success) {
      throw new Error(result.error);
    }
    return true;
  }

  // Web: try File System Access API (Chromium browsers).
  // Note: showSaveFilePicker requires an active user gesture. When called after
  // async work (dynamic import + blob generation), the gesture may have expired,
  // causing an AbortError. This is caught below and falls through to the Blob
  // URL download fallback, which always works without a gesture.
  if (hasShowSaveFilePicker(window)) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: suggestedName.split(".").pop()?.toUpperCase() ?? "ファイル",
            accept,
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") return false;
      throw error;
    }
  }

  // Fallback: trigger download via Blob URL
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

/**
 * Hook that provides export functionality and registers Electron menu handlers.
 * Handles PDF, EPUB, DOCX, TXT export with progress notifications.
 */
export function useExport({
  getContent,
  getTitle,
  getIsEditorTabActive,
  onExportDialogRequest,
}: UseExportParams): {
  exportAs: (format: ExportFormat) => Promise<void>;
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

      const formatLabels: Record<ExportFormat, string> = {
        pdf: "PDF",
        epub: "EPUB",
        docx: "DOCX",
        txt: "テキスト",
        "txt-ruby": "テキスト（ルビ付き）",
      };
      const label = formatLabels[format];

      // TXT exports are client-side (no Electron IPC needed)
      if (format === "txt" || format === "txt-ruby") {
        const progressId = notificationManager.showProgress(`${label}をエクスポート中...`, {
          type: "info",
        });

        try {
          const converted = format === "txt" ? mdiToPlainText(content) : mdiToRubyText(content);

          const baseName = title.replace(/\.(mdi|md|txt)$/i, "");
          const suffix = format === "txt-ruby" ? "_ruby" : "";
          const suggestedName = `${baseName}${suffix}.txt`;

          const blob = new Blob([converted], { type: "text/plain;charset=utf-8" });
          const saved = await saveBlobFile(
            blob,
            suggestedName,
            { "text/plain": [".txt"] },
            isElectron,
            ".txt",
          );
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

      // PDF/DOCX export: delegate to settings dialog when callback is provided (Electron only)
      if (
        (format === "pdf" || format === "docx") &&
        onExportDialogRequest &&
        isElectronRenderer()
      ) {
        onExportDialogRequest(format, content, metadata);
        return;
      }

      // --- Web mode: browser-side export ---
      if (!isElectron || !window.electronAPI) {
        await exportAsWeb(format, content, title, metadata, label);
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
            result = await window.electronAPI.exportPDF?.(content, {
              metadata,
              verticalWriting: false,
              pageSize: "A5",
            });
            break;
          case "epub":
            result = await window.electronAPI.exportEPUB?.(content, { metadata });
            break;
          case "docx":
            result = await window.electronAPI.exportDOCX?.(content, { metadata });
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
    [getContent, getTitle, getIsEditorTabActive, isElectron, onExportDialogRequest],
  );

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
    if (window.electronAPI.onMenuExportPDF) {
      cleanups.push(window.electronAPI.onMenuExportPDF(() => void exportAs("pdf")));
    }
    if (window.electronAPI.onMenuExportEPUB) {
      cleanups.push(window.electronAPI.onMenuExportEPUB(() => void exportAs("epub")));
    }
    if (window.electronAPI.onMenuExportDOCX) {
      cleanups.push(window.electronAPI.onMenuExportDOCX(() => void exportAs("docx")));
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup?.();
      }
    };
  }, [isElectron, exportAs]);

  return { exportAs };
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
): Promise<void> {
  const baseName = title.replace(/\.(mdi|md|txt)$/i, "");

  if (format === "pdf") {
    // window.open() must be called synchronously within the user gesture
    // to avoid popup blocker. Open an empty window now, then populate it.
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      notificationManager.warning(
        "ポップアップがブロックされました。ブラウザの設定を確認してください。",
      );
      return;
    }

    notificationManager.info(
      "印刷ダイアログからPDFとして保存できます（縦書き・詳細設定はデスクトップ版のみ対応）",
    );

    // Show a loading indicator while the dynamic import runs.
    // The window is already open (sync), so the user sees immediate feedback.
    printWindow.document.write(
      '<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;color:#666"><p>読み込み中…</p></body></html>',
    );

    try {
      const { mdiToHtml } = await import("./mdi-to-html");
      const html = mdiToHtml(content, { metadata, bodyOnly: false });
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      // Close the popup after printing (or when the user cancels the dialog).
      // Safari < 17 does not fire "afterprint", so add a fallback close via
      // the "focus" event on the opener window (fires when print dialog closes).
      let closed = false;
      const closeOnce = (): void => {
        if (!closed) {
          closed = true;
          printWindow.close();
        }
      };
      printWindow.addEventListener("afterprint", closeOnce);
      window.addEventListener("focus", closeOnce, { once: true });
      printWindow.print();
    } catch (error) {
      printWindow.close();
      const message = error instanceof Error ? error.message : "不明なエラー";
      notificationManager.error(`PDFのエクスポートに失敗しました: ${message}`);
    }
    return;
  }

  const progressId = notificationManager.showProgress(`${label}をエクスポート中...`, {
    type: "info",
  });

  try {
    let blob: Blob;
    let suggestedName: string;
    let accept: Record<string, string[]>;

    switch (format) {
      case "docx": {
        const { generateDocxBlob } = await import("./docx-exporter");
        blob = await generateDocxBlob(content, { metadata });
        suggestedName = `${baseName}.docx`;
        accept = {
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
        };
        break;
      }
      case "epub": {
        const { generateEpubBlob } = await import("./epub-web");
        blob = await generateEpubBlob(content, { metadata });
        suggestedName = `${baseName}.epub`;
        accept = { "application/epub+zip": [".epub"] };
        break;
      }
      default:
        notificationManager.dismiss(progressId);
        return;
    }

    const saved = await saveBlobFile(blob, suggestedName, accept, false);
    notificationManager.dismiss(progressId);

    if (saved) {
      notificationManager.success(`${label}をエクスポートしました`);
    }
  } catch (error) {
    notificationManager.dismiss(progressId);
    const message = error instanceof Error ? error.message : "不明なエラー";
    notificationManager.error(`${label}のエクスポートに失敗しました: ${message}`);
  }
}

/**
 * Type guard: checks whether window has the File System Access API showSaveFilePicker method.
 */
function hasShowSaveFilePicker(w: Window): w is Window & {
  showSaveFilePicker: (options?: object) => Promise<FileSystemFileHandle>;
} {
  return "showSaveFilePicker" in w;
}
