"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import clsx from "clsx";
import GlassDialog from "./GlassDialog";
import {
  loadExportSettings,
  saveExportSettings,
  toPdfExportSettings,
  toDocxExportSettings,
  toEpubExportOptions,
} from "@/lib/export/export-settings";
import { FontSelector } from "@/components/explorer/FontSelector";
import { PageSizeSelector } from "@/components/PageSizeSelector";
import { openWebPrintPreview } from "@/lib/export/web-print-preview";
import { isElectronRenderer } from "@/lib/utils/runtime-env";
import { useAuthSafe } from "@/contexts/AuthContext";

import type {
  UnifiedExportSettings,
  PageNumberFormat,
  PageNumberPosition,
} from "@/lib/export/export-settings";
import type { PdfExportSettings } from "@/lib/export/pdf-export-settings";
import type { DocxExportSettings } from "@/lib/export/docx-export-settings";
import type { EpubExportOptions, ChapterSplitLevel } from "@/lib/export/epub-shared";
import type { ExportMetadata } from "@/lib/export/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportDialogFormat = "pdf" | "docx" | "epub";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExportDialogProps {
  isOpen: boolean;
  mode?: "export" | "print";
  initialFormat: ExportDialogFormat;
  onClose: () => void;
  onExportPdf: (settings: PdfExportSettings) => void;
  onExportDocx: (settings: DocxExportSettings) => void;
  onExportEpub?: (options: EpubExportOptions) => void;
  content: string;
  metadata: ExportMetadata;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_NUMBER_FORMAT_OPTIONS: { value: PageNumberFormat; label: string }[] = [
  { value: "simple", label: "1" },
  { value: "dash", label: "- 1 -" },
  { value: "fraction", label: "1/1" },
];

const PAGE_NUMBER_POSITION_OPTIONS: { value: PageNumberPosition; label: string }[] = [
  { value: "bottom-left", label: "左下" },
  { value: "bottom-center", label: "中央下" },
  { value: "bottom-right", label: "右下" },
  { value: "top-left", label: "左上" },
  { value: "top-center", label: "中央上" },
  { value: "top-right", label: "右上" },
];

const CHAPTER_SPLIT_OPTIONS: { value: ChapterSplitLevel; label: string }[] = [
  { value: "h1", label: "見出し1（#）" },
  { value: "h2", label: "見出し2（##）まで" },
  { value: "h3", label: "見出し3（###）まで" },
  { value: "none", label: "分割しない" },
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
  mode = "export",
  initialFormat,
  onClose,
  onExportPdf,
  onExportDocx,
  onExportEpub,
  content,
  metadata,
}: ExportDialogProps): React.ReactNode {
  if (!isOpen) return null;
  return (
    <ExportDialogInner
      mode={mode}
      initialFormat={initialFormat}
      onClose={onClose}
      onExportPdf={onExportPdf}
      onExportDocx={onExportDocx}
      onExportEpub={onExportEpub}
      content={content}
      metadata={metadata}
    />
  );
}

function ExportDialogInner({
  mode = "export",
  initialFormat,
  onClose,
  onExportPdf,
  onExportDocx,
  onExportEpub,
  content,
  metadata,
}: Omit<ExportDialogProps, "isOpen">) {
  const [selectedFormat, setSelectedFormat] = useState<ExportDialogFormat>(initialFormat);
  const [settings, setSettings] = useState<UnifiedExportSettings>(() => loadExportSettings());

  const isEpub = selectedFormat === "epub";
  const isElectron = typeof window !== "undefined" && isElectronRenderer();
  const hasPreviewApi = isElectron && !!window.electronAPI?.generatePdfPreview;

  // --- Author auto-fill from auth context ---
  const authContext = useAuthSafe();
  const authUserName = authContext?.user?.name ?? undefined;

  // --- EPUB metadata state ---
  const [epubTitle, setEpubTitle] = useState(metadata.title || "");
  const [epubAuthor, setEpubAuthor] = useState(metadata.author || authUserName || "");

  // Update author when auth finishes loading asynchronously
  useEffect(() => {
    if (authUserName && !epubAuthor) {
      setEpubAuthor(authUserName);
    }
  }, [authUserName]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Cover image state ---
  const [coverImage, setCoverImage] = useState<Uint8Array | null>(null);
  const [coverMediaType, setCoverMediaType] = useState<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // --- Blob URL refs for cleanup (state captures stale values in [] effects) ---
  const pdfUrlRef = useRef<string | null>(null);
  const coverPreviewUrlRef = useRef<string | null>(null);

  // --- Electron PDF preview state ---
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const generationIdRef = useRef(0);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // --- Cover image handling ---
  const handleCoverFile = useCallback((file: File) => {
    if (!file.type.match(/^image\/(jpeg|png)$/)) return;
    const reader = new FileReader();
    reader.onload = () => {
      const buf = new Uint8Array(reader.result as ArrayBuffer);
      setCoverImage(buf);
      setCoverMediaType(file.type);
      const blob = new Blob([buf], { type: file.type });
      const newUrl = URL.createObjectURL(blob);
      coverPreviewUrlRef.current = newUrl;
      setCoverPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return newUrl;
      });
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleCoverRemove = useCallback(() => {
    setCoverImage(null);
    setCoverMediaType(null);
    setCoverPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    coverPreviewUrlRef.current = null;
    if (coverInputRef.current) coverInputRef.current.value = "";
  }, []);

  const handleCoverDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleCoverFile(file);
    },
    [handleCoverFile],
  );

  // --- Export handler ---
  const handleExport = useCallback(() => {
    saveExportSettings(settings);

    if (isEpub && onExportEpub) {
      const options = toEpubExportOptions(
        settings,
        {
          title: epubTitle || metadata.title,
          author: epubAuthor || metadata.author,
          language: metadata.language ?? "ja",
        },
        coverImage ?? undefined,
        coverMediaType ?? undefined,
      );
      onExportEpub(options);
      return;
    }

    if (mode === "print" || selectedFormat === "pdf") {
      onExportPdf(toPdfExportSettings(settings));
    } else {
      onExportDocx(toDocxExportSettings(settings));
    }
  }, [
    settings,
    selectedFormat,
    mode,
    isEpub,
    onExportPdf,
    onExportDocx,
    onExportEpub,
    epubTitle,
    epubAuthor,
    metadata,
    coverImage,
    coverMediaType,
  ]);

  // --- Electron: debounced PDF preview generation ---
  useEffect(() => {
    if (!hasPreviewApi || isEpub) return;

    if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);

    previewTimeoutRef.current = setTimeout(async () => {
      const id = ++generationIdRef.current;
      setPreviewLoading(true);
      setPreviewError(null);

      const previewSettings = toPdfExportSettings(settings);

      try {
        const result = await window.electronAPI!.generatePdfPreview!(content, {
          metadata,
          verticalWriting: settings.verticalWriting,
          pageSize: previewSettings.pageSize,
          landscape: previewSettings.landscape,
          margins: previewSettings.margins,
          charsPerLine: previewSettings.charsPerLine,
          linesPerPage: previewSettings.linesPerPage,
          fontFamily: previewSettings.fontFamily,
          showPageNumbers: previewSettings.showPageNumbers,
          pageNumberFormat: previewSettings.pageNumberFormat,
          pageNumberPosition: previewSettings.pageNumberPosition,
          textIndent: previewSettings.textIndent,
          googleFontFamily: previewSettings.googleFontFamily,
        });

        if (id !== generationIdRef.current) return;

        if (result.success) {
          if (pdfUrl) URL.revokeObjectURL(pdfUrl);

          const bytes = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: "application/pdf" });
          const newPdfUrl = URL.createObjectURL(blob) + "#view=FitH";
          pdfUrlRef.current = newPdfUrl;
          setPdfUrl(newPdfUrl);
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

  // Cleanup blob URLs on unmount (refs always hold the latest values)
  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      if (coverPreviewUrlRef.current) URL.revokeObjectURL(coverPreviewUrlRef.current);
      if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    };
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

  // --- Action button label ---
  const actionLabel =
    mode === "print"
      ? "印刷"
      : isEpub
        ? "EPUBとしてエクスポート"
        : selectedFormat === "pdf"
          ? "PDFとしてエクスポート"
          : "DOCXとしてエクスポート";

  return (
    <GlassDialog
      isOpen
      onBackdropClick={onClose}
      ariaLabel={mode === "print" ? "印刷設定" : "エクスポート設定"}
      panelClassName={clsx("mx-4 w-full p-0 overflow-hidden", isEpub ? "max-w-2xl" : "max-w-7xl")}
    >
      <div className="flex max-h-[85vh]">
        {/* Left: Settings panel */}
        <div
          className={clsx(
            "flex-shrink-0 flex flex-col",
            isEpub ? "w-full" : "w-80 border-r border-border",
          )}
        >
          <div className="px-6 pt-6 pb-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground mb-3">
              {mode === "print" ? "印刷設定" : "エクスポート設定"}
            </h2>
            {/* Format toggle (hidden in print mode) */}
            {mode !== "print" && (
              <div className="flex gap-1 p-1 bg-background-secondary rounded-lg">
                {(["pdf", "docx", "epub"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    className={clsx(
                      "flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                      selectedFormat === fmt
                        ? "bg-accent text-accent-foreground shadow-sm"
                        : "text-foreground-secondary hover:text-foreground",
                    )}
                    onClick={() => setSelectedFormat(fmt)}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div
            className={clsx(
              "flex-1 overflow-y-auto px-6 py-4 space-y-4",
              isEpub && "max-w-lg mx-auto w-full",
            )}
          >
            {/* ══════════════════════════════════════════════════════════ */}
            {/* EPUB-only: Metadata section                              */}
            {/* ══════════════════════════════════════════════════════════ */}
            {isEpub && (
              <>
                {/* Cover image upload */}
                <div>
                  <label className={labelClass}>表紙画像</label>
                  <div
                    className={clsx(
                      "relative w-40 h-60 mx-auto border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer transition-colors",
                      coverPreviewUrl
                        ? "border-accent"
                        : "border-border-secondary hover:border-foreground-tertiary",
                    )}
                    onClick={() => coverInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleCoverDrop}
                  >
                    {coverPreviewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={coverPreviewUrl}
                        alt="表紙プレビュー"
                        className="w-full h-full object-contain rounded-lg"
                      />
                    ) : (
                      <div className="text-center text-foreground-tertiary text-xs px-2">
                        <p>クリックまたはドラッグ&amp;ドロップ</p>
                        <p className="mt-1">JPEG / PNG</p>
                      </div>
                    )}
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/jpeg,image/png"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleCoverFile(file);
                      }}
                    />
                  </div>
                  {coverPreviewUrl && (
                    <button
                      type="button"
                      className="block mx-auto mt-2 text-xs text-danger hover:underline"
                      onClick={handleCoverRemove}
                    >
                      表紙を削除
                    </button>
                  )}
                </div>

                {/* Title */}
                <div>
                  <label className={labelClass}>書名</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={epubTitle}
                    onChange={(e) => setEpubTitle(e.target.value)}
                    placeholder={metadata.title || "タイトルを入力"}
                  />
                </div>

                {/* Author */}
                <div>
                  <label className={labelClass}>著者名</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={epubAuthor}
                    onChange={(e) => setEpubAuthor(e.target.value)}
                    placeholder="著者名を入力"
                  />
                </div>

                {/* Publisher */}
                <div>
                  <label className={labelClass}>出版社</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={settings.epubPublisher}
                    onChange={(e) => updateField("epubPublisher", e.target.value)}
                    placeholder="任意"
                  />
                </div>

                {/* Identifier */}
                <div>
                  <label className={labelClass}>識別子（UUID/ISBN）</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={settings.epubIdentifier}
                    onChange={(e) => updateField("epubIdentifier", e.target.value)}
                    placeholder="自動生成UUID"
                  />
                </div>

                {/* Chapter split */}
                <div>
                  <label className={labelClass}>章の分割</label>
                  <select
                    className={inputClass}
                    value={settings.epubChapterSplitLevel}
                    onChange={(e) =>
                      updateField("epubChapterSplitLevel", e.target.value as ChapterSplitLevel)
                    }
                  >
                    {CHAPTER_SPLIT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <hr className="border-border" />
              </>
            )}

            {/* ══════════════════════════════════════════════════════════ */}
            {/* Page layout section (hidden for EPUB)                     */}
            {/* ══════════════════════════════════════════════════════════ */}
            {!isEpub && (
              <>
                {/* Paper size */}
                <div>
                  <label className={labelClass}>用紙サイズ</label>
                  <PageSizeSelector
                    value={settings.pageSize}
                    onChange={(size) => updateField("pageSize", size)}
                  />
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
              </>
            )}

            {/* Writing direction (shared: PDF/DOCX/EPUB) */}
            <div>
              <label className={labelClass}>組方向</label>
              {isEpub && (
                <p className="text-xs text-foreground-tertiary mb-1">
                  EPUBのCSS writing-modeに反映
                </p>
              )}
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

            <hr className="border-border" />

            {/* ── Typography section ── */}

            {/* Chars per line + Lines per page (PDF/DOCX only) */}
            {!isEpub && (
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
            )}

            {/* Font (shared) */}
            <div>
              <label className={labelClass}>フォント</label>
              <FontSelector
                value={settings.fontFamily}
                onChange={(font) => updateField("fontFamily", font)}
              />
            </div>

            {/* Indent (shared) */}
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

            {/* ── Page number section (PDF/DOCX only) ── */}
            {!isEpub && (
              <>
                <hr className="border-border" />

                <div className="flex items-center justify-between">
                  <label className={labelClass + " mb-0"}>ページ番号</label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.showPageNumbers}
                    onClick={() => updateField("showPageNumbers", !settings.showPageNumbers)}
                    className={clsx(
                      "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors",
                      settings.showPageNumbers ? "bg-accent" : "bg-border-secondary",
                    )}
                  >
                    <span
                      className={clsx(
                        "inline-block h-5 w-5 transform rounded-full bg-background transition-transform",
                        settings.showPageNumbers ? "translate-x-6" : "translate-x-1",
                      )}
                    />
                  </button>
                </div>
                {showWebPageNumberHint && (
                  <p className="text-xs text-foreground-tertiary -mt-2">
                    Web版ではこの設定は適用されません。必要な場合はブラウザの印刷設定でヘッダー/フッターを有効にしてください。
                  </p>
                )}

                {settings.showPageNumbers && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>形式</label>
                      <select
                        className={inputClass}
                        value={settings.pageNumberFormat}
                        onChange={(e) =>
                          updateField("pageNumberFormat", e.target.value as PageNumberFormat)
                        }
                      >
                        {PAGE_NUMBER_FORMAT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>位置</label>
                      <select
                        className={inputClass}
                        value={settings.pageNumberPosition}
                        onChange={(e) =>
                          updateField("pageNumberPosition", e.target.value as PageNumberPosition)
                        }
                      >
                        {PAGE_NUMBER_POSITION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <hr className="border-border" />

                {/* ── Margins section (PDF/DOCX only) ── */}
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
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 px-6 py-4 border-t border-border flex-shrink-0">
            <button
              type="button"
              className="w-full px-4 py-2 rounded-lg text-sm bg-accent text-accent-foreground hover:bg-accent-hover transition-colors"
              onClick={handleExport}
            >
              {actionLabel}
            </button>
            <button
              type="button"
              className="w-full px-4 py-2 rounded-lg text-sm text-foreground-secondary hover:bg-hover transition-colors"
              onClick={onClose}
            >
              キャンセル
            </button>
          </div>
        </div>

        {/* Right: Preview panel (hidden for EPUB) */}
        {!isEpub && (
          <div className="flex-1 flex flex-col bg-background-secondary min-w-0">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
              <span className="text-sm font-medium text-foreground">プレビュー</span>
              <span className="text-xs text-foreground-tertiary">
                {settings.pageSize} · {settings.landscape ? "横置き" : "縦置き"} ·{" "}
                {settings.verticalWriting ? "縦書き" : "横書き"}
              </span>
            </div>

            <div className="flex-1 overflow-hidden">
              {hasPreviewApi ? (
                pdfUrl ? (
                  <embed src={pdfUrl} type="application/pdf" className="w-full h-full" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {previewLoading && (
                      <span className="text-sm text-foreground-tertiary">
                        プレビューを生成中...
                      </span>
                    )}
                    {previewError && <span className="text-sm text-danger">{previewError}</span>}
                  </div>
                )
              ) : selectedFormat === "pdf" ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
                  <div className="text-center space-y-2">
                    <p className="text-sm text-foreground-secondary">
                      ブラウザの印刷プレビューで確認できます
                    </p>
                    <p className="text-xs text-foreground-tertiary">
                      {settings.pageSize} · {settings.landscape ? "横置き" : "縦置き"} ·{" "}
                      {settings.verticalWriting ? "縦書き" : "横書き"} · {settings.fontFamily}
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
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-foreground-tertiary">
                    DOCXの内蔵プレビューはありません。エクスポートして確認してください。
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </GlassDialog>
  );
}
