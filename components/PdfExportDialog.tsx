"use client";

import { useState, useCallback, useEffect, useRef, useMemo, type KeyboardEvent } from "react";
import clsx from "clsx";
import GlassDialog from "./GlassDialog";
import {
  loadPdfExportSettings,
  savePdfExportSettings,
  calculateTypesetting,
  PAGE_DIMENSIONS,
} from "@/lib/export/pdf-export-settings";
import { mdiToHtml } from "@/lib/export/mdi-to-html";

import type { PdfExportSettings } from "@/lib/export/pdf-export-settings";
import type { ExportMetadata } from "@/lib/export/types";

interface PdfExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (settings: PdfExportSettings) => void;
  content: string;
  metadata: ExportMetadata;
}

type PageSize = PdfExportSettings["pageSize"];

const PAGE_SIZE_OPTIONS: { value: PageSize; label: string }[] = [
  { value: "A4", label: "A4 (210×297mm)" },
  { value: "A5", label: "A5 (148×210mm)" },
  { value: "B5", label: "B5 (176×250mm)" },
  { value: "B6", label: "B6 (125×176mm)" },
];

const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: "serif", label: "明朝体（既定）" },
  { value: '"游明朝", "Yu Mincho", serif', label: "游明朝" },
  { value: '"ヒラギノ明朝 ProN", "Hiragino Mincho ProN", serif', label: "ヒラギノ明朝" },
  { value: '"Noto Serif JP", serif', label: "Noto Serif JP" },
  { value: "sans-serif", label: "ゴシック体" },
  { value: '"游ゴシック", "Yu Gothic", sans-serif', label: "游ゴシック" },
];

const inputClass =
  "w-full px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent";
const numberInputClass =
  "w-24 px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent";
const labelClass = "block text-sm font-medium text-foreground mb-1";

// 96dpi: 1mm = 96/25.4 px
const MM_TO_PX = 96 / 25.4;
// Fixed width of each page thumbnail in px
const PREVIEW_PAGE_WIDTH = 300;
// Pages shown initially before lazy loading
const INITIAL_PAGES = 5;
// Additional pages loaded per scroll batch
const PAGES_PER_BATCH = 3;

/**
 * Split MDI content into page-sized chunks based on estimated chars per page.
 * Splits on paragraph boundaries (double newlines) to avoid breaking mid-paragraph.
 */
function splitContentIntoPages(content: string, charsPerPage: number): string[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const paragraphs = trimmed.split(/\n{2,}/);
  const pages: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length > 0 && current.length + para.length > charsPerPage) {
      pages.push(current);
      current = para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  if (current.trim()) pages.push(current);

  return pages.length > 0 ? pages : [trimmed];
}

/**
 * Wrapper that unmounts the inner form when closed,
 * so useState initializer reloads settings each time the dialog opens.
 */
export default function PdfExportDialog({
  isOpen,
  onClose,
  onExport,
  content,
  metadata,
}: PdfExportDialogProps) {
  if (!isOpen) return null;
  return (
    <PdfExportDialogInner
      onClose={onClose}
      onExport={onExport}
      content={content}
      metadata={metadata}
    />
  );
}

function PdfExportDialogInner({
  onClose,
  onExport,
  content,
  metadata,
}: Omit<PdfExportDialogProps, "isOpen">) {
  const [settings, setSettings] = useState<PdfExportSettings>(() => loadPdfExportSettings());
  // Page content chunks (split by estimated chars per page)
  const [pageChunks, setPageChunks] = useState<string[]>([]);
  // Whether the initial debounce has completed (to distinguish "loading" from "no content")
  const [ready, setReady] = useState(false);
  // How many pages are currently rendered in the preview
  const [visibleCount, setVisibleCount] = useState(INITIAL_PAGES);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const updateField = useCallback(
    <K extends keyof PdfExportSettings>(key: K, value: PdfExportSettings[K]) => {
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
    savePdfExportSettings(settings);
    onExport(settings);
  }, [settings, onExport]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  // Debounced re-split when settings or content change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const charsPerPage = settings.charsPerLine * settings.linesPerPage;
      const chunks = splitContentIntoPages(content, charsPerPage);
      setPageChunks(chunks);
      setVisibleCount(INITIAL_PAGES);
      setReady(true);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [settings, content]);

  const hasMore = visibleCount < pageChunks.length;

  // IntersectionObserver: load more pages when sentinel scrolls into view.
  // Depends on hasMore so it re-registers whenever the sentinel element
  // appears (false→true) or disappears (true→false) in the DOM.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => prev + PAGES_PER_BATCH);
        }
      },
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore]);

  // Memoize typesetting options from current settings
  const typesettingOptions = useMemo(() => {
    const { fontSizeMm, lineHeightRatio } = calculateTypesetting(
      settings.pageSize,
      settings.margins,
      settings.charsPerLine,
      settings.linesPerPage,
      settings.verticalWriting,
      settings.landscape,
    );
    return {
      metadata,
      verticalWriting: settings.verticalWriting,
      typesetting: {
        fontFamily: settings.fontFamily,
        fontSizeMm,
        lineHeightRatio,
        textIndentEm: settings.textIndent,
        margins: settings.margins,
      },
    };
  }, [settings, metadata]);

  // Generate HTML only for currently visible pages
  const visiblePageHtml = useMemo(() => {
    const limit = Math.min(visibleCount, pageChunks.length);
    return pageChunks.slice(0, limit).map((chunk) => mdiToHtml(chunk, typesettingOptions));
  }, [pageChunks, visibleCount, typesettingOptions]);

  // Page thumbnail dimensions (swap width/height when landscape)
  const { pageWidthPx, pageHeightPx, scale, dims } = useMemo(() => {
    const base = PAGE_DIMENSIONS[settings.pageSize] ?? PAGE_DIMENSIONS["A5"];
    const d = settings.landscape
      ? { width: base.height, height: base.width }
      : base;
    const w = d.width * MM_TO_PX;
    const h = d.height * MM_TO_PX;
    return { pageWidthPx: w, pageHeightPx: h, scale: PREVIEW_PAGE_WIDTH / w, dims: d };
  }, [settings.pageSize, settings.landscape]);

  const scaledHeight = Math.round(pageHeightPx * scale);
  const isEmpty = pageChunks.length === 0;

  return (
    <GlassDialog
      isOpen
      onBackdropClick={onClose}
      ariaLabel="PDFエクスポート設定"
      panelClassName="mx-4 w-full max-w-5xl p-0 overflow-hidden"
    >
      <div onKeyDown={handleKeyDown} className="flex max-h-[85vh]">
        {/* Left: Settings panel */}
        <div className="w-80 flex-shrink-0 flex flex-col border-r border-border">
          <div className="px-6 pt-6 pb-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">PDFエクスポート設定</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Paper size */}
            <div>
              <label className={labelClass}>用紙サイズ</label>
              <select
                className={inputClass}
                value={settings.pageSize}
                onChange={(e) => updateField("pageSize", e.target.value as PageSize)}
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
                  <option key={opt.value} value={opt.value}>
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
              エクスポート
            </button>
          </div>
        </div>

        {/* Right: Preview panel */}
        <div className="flex-1 flex flex-col bg-background-secondary min-w-0">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
            <span className="text-sm font-medium text-foreground">プレビュー</span>
            <span className="text-xs text-foreground-tertiary">
              {settings.pageSize} · {settings.landscape ? "横置き" : "縦置き"} ·{" "}
              {settings.verticalWriting ? "縦書き" : "横書き"}
              {pageChunks.length > 0 && ` · 全${pageChunks.length}ページ`}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {!ready ? (
              <div className="flex items-center justify-center h-full text-foreground-tertiary text-sm">
                生成中...
              </div>
            ) : isEmpty ? (
              <div className="flex items-center justify-center h-full text-foreground-tertiary text-sm">
                コンテンツがありません
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 p-6">
                {visiblePageHtml.map((html, i) => (
                  <PageThumbnail
                    key={i}
                    html={html}
                    pageNumber={i + 1}
                    pageWidthPx={pageWidthPx}
                    pageHeightPx={pageHeightPx}
                    scale={scale}
                    scaledHeight={scaledHeight}
                    dims={dims}
                  />
                ))}

                {/* Sentinel: triggers loading more pages when scrolled into view */}
                {hasMore && (
                  <div ref={sentinelRef} className="w-full flex justify-center py-2">
                    <span className="text-xs text-foreground-tertiary">読み込み中...</span>
                  </div>
                )}

                {!hasMore && pageChunks.length > 0 && (
                  <p className="text-xs text-foreground-tertiary py-2">
                    全{pageChunks.length}ページ表示済み
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </GlassDialog>
  );
}

interface PageThumbnailProps {
  html: string;
  pageNumber: number;
  pageWidthPx: number;
  pageHeightPx: number;
  scale: number;
  scaledHeight: number;
  dims: { width: number; height: number };
}

function PageThumbnail({
  html,
  pageNumber,
  pageWidthPx,
  pageHeightPx,
  scale,
  scaledHeight,
  dims,
}: PageThumbnailProps) {
  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0">
      <div
        className="shadow-lg bg-white"
        style={{ width: PREVIEW_PAGE_WIDTH, height: scaledHeight, overflow: "hidden" }}
      >
        <iframe
          srcDoc={html}
          sandbox="allow-same-origin"
          title={`ページ ${pageNumber}`}
          style={{
            width: pageWidthPx,
            height: pageHeightPx,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            border: "none",
            display: "block",
          }}
        />
      </div>
      <span className="text-xs text-foreground-tertiary">
        {pageNumber} / {dims.width}×{dims.height}mm
      </span>
    </div>
  );
}

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
