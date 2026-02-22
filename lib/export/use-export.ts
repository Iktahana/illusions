"use client";

import { useCallback, useEffect } from "react";
import { isElectronRenderer } from "@/lib/runtime-env";
import { notificationManager } from "@/lib/notification-manager";
import type { ExportFormat } from "./types";

interface UseExportParams {
  /** Returns the current editor content as markdown */
  getContent: () => string;
  /** Returns the document title (file name or fallback) */
  getTitle: () => string;
}

/**
 * Hook that provides export functionality and registers Electron menu handlers.
 * Handles PDF, EPUB, DOCX export with progress notifications.
 */
export function useExport({ getContent, getTitle }: UseExportParams): {
  exportAs: (format: ExportFormat) => Promise<void>;
} {
  const isElectron = typeof window !== "undefined" && isElectronRenderer();

  const exportAs = useCallback(
    async (format: ExportFormat) => {
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
      };
      const label = formatLabels[format];

      const progressId = notificationManager.showProgress(
        `${label}をエクスポート中...`,
        { type: "info" }
      );

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
          notificationManager.warning(
            "エクスポート機能はデスクトップ版でのみ利用可能です"
          );
          return;
        }

        notificationManager.dismiss(progressId);

        if (result === null || result === undefined) {
          // User cancelled the save dialog — no notification
          return;
        }

        if (typeof result === "object" && "success" in result && !result.success) {
          notificationManager.error(
            `${label}のエクスポートに失敗しました: ${result.error}`
          );
          return;
        }

        notificationManager.success(`${label}をエクスポートしました`);
      } catch (error) {
        notificationManager.dismiss(progressId);
        const message =
          error instanceof Error ? error.message : "Unknown error";
        notificationManager.error(
          `${label}のエクスポートに失敗しました: ${message}`
        );
      }
    },
    [getContent, getTitle, isElectron]
  );

  // Register Electron menu event handlers
  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;

    const cleanups: Array<(() => void) | void> = [];

    if (window.electronAPI.onMenuExportPDF) {
      cleanups.push(
        window.electronAPI.onMenuExportPDF(() => void exportAs("pdf"))
      );
    }
    if (window.electronAPI.onMenuExportEPUB) {
      cleanups.push(
        window.electronAPI.onMenuExportEPUB(() => void exportAs("epub"))
      );
    }
    if (window.electronAPI.onMenuExportDOCX) {
      cleanups.push(
        window.electronAPI.onMenuExportDOCX(() => void exportAs("docx"))
      );
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup?.();
      }
    };
  }, [isElectron, exportAs]);

  return { exportAs };
}
