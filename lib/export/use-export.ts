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
 * Save text content to a file.
 *
 * In Electron, uses the native save dialog via the existing `saveFile` IPC
 * channel (filePath = null triggers dialog.showSaveDialog in the main process).
 * This avoids the user-gesture requirement of showSaveFilePicker, which causes
 * a DOMException when the export is triggered from the application menu over IPC.
 *
 * In web browsers, falls back to the File System Access API when available,
 * and finally to a Blob URL download.
 *
 * @param text - UTF-8 text content to write
 * @param suggestedName - Default file name shown in the save dialog
 * @param isElectron - True when running inside Electron renderer
 */
async function saveTxtFile(
  text: string,
  suggestedName: string,
  isElectron: boolean,
): Promise<boolean> {
  // Electron: delegate to main-process IPC — works regardless of user gesture
  if (isElectron && window.electronAPI) {
    const result = await window.electronAPI.saveFile(null, text, ".txt");
    if (result === null) return false; // User cancelled the dialog
    if (typeof result === "object" && "success" in result && !result.success) {
      throw new Error(result.error);
    }
    return true;
  }

  // Web: try File System Access API (Chromium browsers)
  if (hasShowSaveFilePicker(window)) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: "テキストファイル",
            accept: { "text/plain": [".txt"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") return false;
      throw error;
    }
  }

  // Fallback: trigger download via Blob URL
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
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

          const saved = await saveTxtFile(converted, suggestedName, isElectron);
          notificationManager.dismiss(progressId);

          if (saved) {
            notificationManager.success(`${label}をエクスポートしました`);
          }
        } catch (error) {
          notificationManager.dismiss(progressId);
          const message = error instanceof Error ? error.message : "Unknown error";
          notificationManager.error(`${label}のエクスポートに失敗しました: ${message}`);
        }
        return;
      }

      // PDF/DOCX export: delegate to settings dialog when callback is provided
      if (
        (format === "pdf" || format === "docx") &&
        onExportDialogRequest &&
        isElectronRenderer()
      ) {
        onExportDialogRequest(format, content, metadata);
        return;
      }

      const progressId = notificationManager.showProgress(`${label}をエクスポート中...`, {
        type: "info",
      });

      try {
        let result: string | { success: false; error: string } | null | undefined;

        if (isElectron && window.electronAPI) {
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
        } else {
          // Web mode: not supported yet
          notificationManager.dismiss(progressId);
          notificationManager.warning("エクスポート機能はデスクトップ版でのみ利用可能です");
          return;
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
        const message = error instanceof Error ? error.message : "Unknown error";
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
 * Type guard: checks whether window has the File System Access API showSaveFilePicker method.
 */
function hasShowSaveFilePicker(w: Window): w is Window & {
  showSaveFilePicker: (options?: object) => Promise<FileSystemFileHandle>;
} {
  return "showSaveFilePicker" in w;
}
