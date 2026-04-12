"use client";

import { useState, useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import clsx from "clsx";
import GlassDialog from "./GlassDialog";
import {
  loadExportSettings,
  saveExportSettings,
  toPdfExportSettings,
  toDocxExportSettings,
  fontKeyToCss,
  FONT_OPTIONS,
} from "@/lib/export/export-settings";
import { isElectronRenderer } from "@/lib/utils/runtime-env";

import type { UnifiedExportSettings, ExportPageSize } from "@/lib/export/export-settings";
import type { PdfExportSettings } from "@/lib/export/pdf-export-settings";
import type { DocxExportSettings } from "@/lib/export/docx-export-settings";
import type { ExportMetadata } from "@/lib/export/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExportDialogProps {
  isOpen: boolean;
  initialFormat: "pdf" | "docx";
  onClose: () => void;
  onExportPdf: (settings: PdfExportSettings) => void;
  onExportDocx: (settings: DocxExportSettings) => void;
  content: string;
  metadata: ExportMetadata;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE_OPTIONS: { value: ExportPageSize; label: string }[] = [
  { value: "A4", label: "A4 (210×297mm)" },
  { value: "A5", label: "A5 (148×210mm)" },
  { value: "B5", label: "B5 (176×250mm)" },
  { value: "B6", label: "B6 (125×176mm)" },
];

const inputClass =
  "w-full px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent";
const numberInputClass =
  "w-24 px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent";
const labelClass = "block text-sm font-medium text-foreground mb-1";

// Debounce delay for PDF regeneration (ms)
const PREVIEW_DEBOUNCE_MS = 800;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampInt(raw: string, min: number, max: number): number {
  const n = parseInt(raw, 10);
  if (isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function clampFloat(raw: string, min: number, max: number): number {
  const n = parseFloat(raw);
  if (isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/**
 * Build PDF export options for the preview IPC call.
 * When DOCX is selected, forces horizontal writing since DOCX does not support vertical.
 */
function buildPreviewOptions(
  settings: UnifiedExportSettings,
  format: "pdf" | "docx",
  metadata: ExportMetadata,
): Record<string, unknown> {
  const verticalWriting = format === "pdf" ? settings.verticalWriting : false;
  return {
    metadata,
    verticalWriting,
    pageSize: settings.pageSize,
    landscape: settings.landscape,
    margins: settings.margins,
    charsPerLine: settings.charsPerLine,
    linesPerPage: settings.linesPerPage,
    fontFamily: fontKeyToCss(settings.fontFamily),
    showPageNumbers: settings.showPageNumbers,
    textIndent: settings.textIndent,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Wrapper that unmounts the inner form when closed,
 * so useState initializer reloads settings each time the dialog opens.
 */
export default function ExportDialog({
  isOpen,
  initialFormat,
  onClose,
  onExportPdf,
  onExportDocx,
  content,
  metadata,
}: ExportDialogProps): React.ReactNode {
  if (!isOpen) return null;
  return (
    <ExportDialogInner
      initialFormat={initialFormat}
      onClose={onClose}
      onExportPdf={onExportPdf}
      onExportDocx={onExportDocx}
      content={content}
      metadata={metadata}
    />
  );
}

function ExportDialogInner({
  initialFormat,
  onClose,
  onExportPdf,
  onExportDocx,
  content,
  metadata,
}: Omit<ExportDialogProps, "isOpen">) {
  const [selectedFormat, setSelectedFormat] = useState<"pdf" | "docx">(initialFormat);
  const [settings, setSettings] = useState<UnifiedExportSettings>(() => loadExportSettings());

  const isElectron = typeof window !== "undefined" && isElectronRenderer();
  const hasPreviewApi = isElectron && !!window.electronAPI?.generatePdfPreview;

  // PDF preview state
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(hasPreviewApi && !!content.trim());
  const [previewError, setPreviewError] = useState<string | null>(
    !hasPreviewApi ? "プレビューはデスクトップ版でのみ利用可能です" : null,
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the latest generation request to discard stale results
  const generationIdRef = useRef(0);

  const updateField = useCallback(
    <K extends keyof UnifiedExportSettings>(key: K, value: UnifiedExportSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const updateMargin = useCallback((side: "top" | "bottom" | "left" | "right", value: number) => {
    setSettings((prev) => ({
      ...prev,
      margins: { ...prev.margins, [side]: value },
    }));
  }, []);

  const handleExport = useCallback(() => {
    saveExportSettings(settings);
    if (selectedFormat === "pdf") {
      onExportPdf(toPdfExportSettings(settings));
    } else {
      onExportDocx(toDocxExportSettings(settings));
    }
  }, [settings, selectedFormat, onExportPdf, onExportDocx]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  // Generate PDF preview via Electron IPC (debounced)
  useEffect(() => {
    if (!hasPreviewApi) return;

    if (!content.trim()) {
      setPdfUrl(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const currentId = ++generationIdRef.current;
      const options = buildPreviewOptions(settings, selectedFormat, metadata);

      setPreviewLoading(true);
      setPreviewError(null);

      const api = window.electronAPI!;
      api.generatePdfPreview!(
        content,
        options as Parameters<NonNullable<typeof api.generatePdfPreview>>[1],
      )
        .then((result) => {
          // Discard if a newer request has been made
          if (currentId !== generationIdRef.current) return;

          if (result.success) {
            // Revoke previous blob URL to avoid memory leaks
            setPdfUrl((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return null;
            });

            const binary = atob(result.data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            setPdfUrl(url);
            setPreviewLoading(false);
          } else {
            setPreviewError(result.error);
            setPreviewLoading(false);
          }
        })
        .catch((err: unknown) => {
          if (currentId !== generationIdRef.current) return;
          setPreviewError(err instanceof Error ? err.message : "プレビュー生成に失敗しました");
          setPreviewLoading(false);
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [settings, selectedFormat, content, metadata, hasPreviewApi]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  // DOCX does not support vertical writing — show hint
  const showDocxVerticalHint = selectedFormat === "docx" && settings.verticalWriting;

  // Preview description for info bar
  const previewVertical = selectedFormat === "pdf" ? settings.verticalWriting : false;

  return (
    <GlassDialog
      isOpen
      onBackdropClick={onClose}
      ariaLabel="エクスポート設定"
      panelClassName="mx-4 w-full max-w-5xl p-0 overflow-hidden"
    >
      <div onKeyDown={handleKeyDown} className="flex max-h-[85vh]">
        {/* Left: Settings panel */}
        <div className="w-80 flex-shrink-0 flex flex-col border-r border-border">
          <div className="px-6 pt-6 pb-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground mb-3">エクスポート設定</h2>
            {/* Format toggle */}
            <div className="flex gap-1 p-1 bg-background-secondary rounded-lg">
              <button
                type="button"
                className={clsx(
                  "flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  selectedFormat === "pdf"
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-foreground-secondary hover:text-foreground",
                )}
                onClick={() => setSelectedFormat("pdf")}
              >
                PDF
              </button>
              <button
                type="button"
                className={clsx(
                  "flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  selectedFormat === "docx"
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-foreground-secondary hover:text-foreground",
                )}
                onClick={() => setSelectedFormat("docx")}
              >
                DOCX
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Paper size */}
            <div>
              <label className={labelClass}>用紙サイズ</label>
              <select
                className={inputClass}
                value={settings.pageSize}
                onChange={(e) => updateField("pageSize", e.target.value as ExportPageSize)}
              >
                {PAGE_SIZE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Page orientation */}
            <div>
              <label className={labelClass}>用紙の向き</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={clsx(
                    "flex-1 px-3 py-2 rounded-lg border text-sm transition-colors",
                    !settings.landscape
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-background text-foreground-secondary border-border-secondary hover:bg-hover",
                  )}
                  onClick={() => updateField("landscape", false)}
                >
                  縦置き
                </button>
                <button
                  type="button"
                  className={clsx(
                    "flex-1 px-3 py-2 rounded-lg border text-sm transition-colors",
                    settings.landscape
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-background text-foreground-secondary border-border-secondary hover:bg-hover",
                  )}
                  onClick={() => updateField("landscape", true)}
                >
                  横置き
                </button>
              </div>
            </div>

            {/* Writing direction */}
            <div>
              <label className={labelClass}>組方向</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={clsx(
                    "flex-1 px-3 py-2 rounded-lg border text-sm transition-colors",
                    settings.verticalWriting
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-background text-foreground-secondary border-border-secondary hover:bg-hover",
                  )}
                  onClick={() => updateField("verticalWriting", true)}
                >
                  縦書き
                </button>
                <button
                  type="button"
                  className={clsx(
                    "flex-1 px-3 py-2 rounded-lg border text-sm transition-colors",
                    !settings.verticalWriting
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-background text-foreground-secondary border-border-secondary hover:bg-hover",
                  )}
                  onClick={() => updateField("verticalWriting", false)}
                >
                  横書き
                </button>
              </div>
            </div>

            {/* Chars per line + Lines per page */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>一行の文字数</label>
                <input
                  type="number"
                  className={numberInputClass + " w-full"}
                  min={10}
                  max={60}
                  step={1}
                  value={settings.charsPerLine}
                  onChange={(e) => updateField("charsPerLine", clampInt(e.target.value, 10, 60))}
                />
              </div>
              <div>
                <label className={labelClass}>一頁の行数</label>
                <input
                  type="number"
                  className={numberInputClass + " w-full"}
                  min={10}
                  max={50}
                  step={1}
                  value={settings.linesPerPage}
                  onChange={(e) => updateField("linesPerPage", clampInt(e.target.value, 10, 50))}
                />
              </div>
            </div>

            {/* Font */}
            <div>
              <label className={labelClass}>フォント</label>
              <select
                className={inputClass}
                value={settings.fontFamily}
                onChange={(e) => updateField("fontFamily", e.target.value)}
              >
                {FONT_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Indent + Page numbers */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>字下げ（em）</label>
                <input
                  type="number"
                  className={numberInputClass + " w-full"}
                  min={0}
                  max={4}
                  step={0.5}
                  value={settings.textIndent}
                  onChange={(e) => updateField("textIndent", clampFloat(e.target.value, 0, 4))}
                />
              </div>
              <div>
                <label className={labelClass}>ページ番号</label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.showPageNumbers}
                  onClick={() => updateField("showPageNumbers", !settings.showPageNumbers)}
                  className={clsx(
                    "relative inline-flex h-9 w-16 shrink-0 items-center rounded-full transition-colors mt-0.5",
                    settings.showPageNumbers ? "bg-accent" : "bg-border-secondary",
                  )}
                >
                  <span
                    className={clsx(
                      "inline-block h-5 w-5 transform rounded-full bg-background transition-transform",
                      settings.showPageNumbers ? "translate-x-9" : "translate-x-2",
                    )}
                  />
                </button>
              </div>
            </div>

            {/* Margins */}
            <div>
              <label className={labelClass}>余白（mm）</label>
              <div className="grid grid-cols-4 gap-2">
                {(["top", "bottom", "left", "right"] as const).map((side) => (
                  <div key={side}>
                    <label className="block text-xs text-foreground-tertiary mb-1 text-center">
                      {{ top: "上", bottom: "下", left: "左", right: "右" }[side]}
                    </label>
                    <input
                      type="number"
                      className={numberInputClass + " w-full"}
                      min={0}
                      max={50}
                      step={1}
                      value={settings.margins[side]}
                      onChange={(e) => updateMargin(side, clampInt(e.target.value, 0, 50))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border flex-shrink-0">
            <button
              type="button"
              className="px-4 py-2 rounded-lg text-sm text-foreground-secondary hover:bg-hover transition-colors"
              onClick={onClose}
            >
              キャンセル
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg text-sm bg-accent text-accent-foreground hover:bg-accent-hover transition-colors"
              onClick={handleExport}
            >
              {selectedFormat === "pdf" ? "PDFとしてエクスポート" : "DOCXとしてエクスポート"}
            </button>
          </div>
        </div>

        {/* Right: Preview panel */}
        <div className="flex-1 flex flex-col bg-background-secondary min-w-0">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
            <span className="text-sm font-medium text-foreground">プレビュー</span>
            <span className="text-xs text-foreground-tertiary">
              {settings.pageSize} · {settings.landscape ? "横置き" : "縦置き"} ·{" "}
              {previewVertical ? "縦書き" : "横書き"}
            </span>
          </div>

          {/* DOCX vertical writing hint */}
          {showDocxVerticalHint && (
            <div className="px-4 py-2 bg-warning/10 border-b border-warning/20 flex-shrink-0">
              <p className="text-xs text-warning-foreground">
                DOCXは縦書きに対応していないため、横書きでプレビューしています
              </p>
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            {previewLoading ? (
              <div className="flex items-center justify-center h-full text-foreground-tertiary text-sm">
                プレビューを生成中...
              </div>
            ) : previewError ? (
              <div className="flex items-center justify-center h-full text-foreground-tertiary text-sm px-4 text-center">
                {previewError}
              </div>
            ) : !content.trim() ? (
              <div className="flex items-center justify-center h-full text-foreground-tertiary text-sm">
                コンテンツがありません
              </div>
            ) : pdfUrl ? (
              <embed
                src={pdfUrl}
                type="application/pdf"
                className="w-full h-full"
                title="エクスポートプレビュー"
              />
            ) : null}
          </div>
        </div>
      </div>
    </GlassDialog>
  );
}
