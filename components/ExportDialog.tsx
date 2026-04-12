"use client";

import { useState, useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import clsx from "clsx";
import GlassDialog from "./GlassDialog";
import {
  loadExportSettings,
  saveExportSettings,
  toPdfExportSettings,
  toDocxExportSettings,
  FONT_OPTIONS,
  PAGE_DIMENSIONS,
} from "@/lib/export/export-settings";
import { openWebPrintPreview } from "@/lib/export/web-print-preview";
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

  // --- Electron PDF preview state ---
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const generationIdRef = useRef(0);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showDocxVerticalHint = selectedFormat === "docx" && settings.verticalWriting;
  const showWebPageNumberHint = !isElectron && selectedFormat === "pdf" && settings.showPageNumbers;

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

  // --- Electron: debounced PDF preview generation ---
  useEffect(() => {
    if (!hasPreviewApi) return;

    if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);

    previewTimeoutRef.current = setTimeout(async () => {
      const id = ++generationIdRef.current;
      setPreviewLoading(true);
      setPreviewError(null);

      // DOCX preview: generate PDF with horizontal writing
      const previewVertical = selectedFormat === "pdf" ? settings.verticalWriting : false;

      const fontCss = FONT_OPTIONS.find((o) => o.key === settings.fontFamily)?.css ?? "serif";

      try {
        const result = await window.electronAPI!.generatePdfPreview!(content, {
          metadata,
          verticalWriting: previewVertical,
          pageSize: settings.pageSize,
          landscape: settings.landscape,
          margins: settings.margins,
          charsPerLine: settings.charsPerLine,
          linesPerPage: settings.linesPerPage,
          fontFamily: fontCss,
          showPageNumbers: settings.showPageNumbers,
          textIndent: settings.textIndent,
        });

        // Discard stale result
        if (id !== generationIdRef.current) return;

        if (result.success) {
          // Revoke previous blob URL
          if (pdfUrl) URL.revokeObjectURL(pdfUrl);

          const bytes = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: "application/pdf" });
          setPdfUrl(URL.createObjectURL(blob) + "#view=FitH");
        } else {
          setPreviewError(result.error);
        }
      } catch (err) {
        if (id !== generationIdRef.current) return;
        setPreviewError(err instanceof Error ? err.message : "Preview generation failed");
      } finally {
        if (id === generationIdRef.current) {
          setPreviewLoading(false);
        }
      }
    }, 800);

    return () => {
      if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPreviewApi, settings, selectedFormat, content, metadata]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Web: print preview button handler ---
  const handleWebPrintPreview = useCallback(async () => {
    setPopupBlocked(false);
    try {
      const pdfSettings = toPdfExportSettings(settings);
      const opened = await openWebPrintPreview(content, metadata, pdfSettings);
      if (!opened) {
        setPopupBlocked(true);
      }
    } catch {
      setPreviewError("印刷プレビューの生成に失敗しました");
    }
  }, [settings, content, metadata]);

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
                {showWebPageNumberHint && (
                  <p className="text-xs text-foreground-tertiary mt-1">
                    Web版ではこの設定は適用されません。必要な場合はブラウザの印刷設定でヘッダー/フッターを有効にしてください。
                  </p>
                )}
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
              {selectedFormat === "pdf" && settings.verticalWriting ? "縦書き" : "横書き"}
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
            {hasPreviewApi ? (
              /* Electron: real PDF preview via <embed> */
              pdfUrl ? (
                <embed src={pdfUrl} type="application/pdf" className="w-full h-full" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {previewLoading && (
                    <span className="text-sm text-foreground-tertiary">プレビューを生成中...</span>
                  )}
                  {previewError && <span className="text-sm text-danger">{previewError}</span>}
                </div>
              )
            ) : selectedFormat === "pdf" ? (
              /* Web + PDF: info panel with print preview button */
              <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
                <div className="text-center space-y-2">
                  <p className="text-sm text-foreground-secondary">
                    ブラウザの印刷プレビューで確認できます
                  </p>
                  <p className="text-xs text-foreground-tertiary">
                    {settings.pageSize} · {settings.landscape ? "横置き" : "縦置き"} ·{" "}
                    {settings.verticalWriting ? "縦書き" : "横書き"} ·{" "}
                    {FONT_OPTIONS.find((o) => o.key === settings.fontFamily)?.label ??
                      settings.fontFamily}
                  </p>
                </div>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg text-sm bg-accent text-accent-foreground hover:bg-accent-hover transition-colors"
                  onClick={handleWebPrintPreview}
                >
                  印刷プレビューを開く
                </button>
                {popupBlocked && (
                  <p className="text-xs text-danger">
                    ポップアップがブロックされました。ブラウザの設定を確認してください。
                  </p>
                )}
              </div>
            ) : (
              /* Web + DOCX: no preview available */
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-foreground-tertiary">
                  DOCXの内蔵プレビューはありません。エクスポートして確認してください。
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </GlassDialog>
  );
}
