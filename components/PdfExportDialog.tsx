"use client";

import { useState, useCallback, type KeyboardEvent } from "react";
import clsx from "clsx";
import GlassDialog from "./GlassDialog";
import { loadPdfExportSettings, savePdfExportSettings } from "@/lib/export/pdf-export-settings";

import type { PdfExportSettings } from "@/lib/export/pdf-export-settings";

interface PdfExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (settings: PdfExportSettings) => void;
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

/**
 * Wrapper that unmounts the inner form when closed,
 * so useState initializer reloads settings each time the dialog opens.
 */
export default function PdfExportDialog({ isOpen, onClose, onExport }: PdfExportDialogProps) {
  if (!isOpen) return null;
  return <PdfExportDialogInner onClose={onClose} onExport={onExport} />;
}

function PdfExportDialogInner({
  onClose,
  onExport,
}: Omit<PdfExportDialogProps, "isOpen">) {
  const [settings, setSettings] = useState<PdfExportSettings>(() => loadPdfExportSettings());

  const updateField = useCallback(
    <K extends keyof PdfExportSettings>(key: K, value: PdfExportSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const updateMargin = useCallback(
    (side: "top" | "bottom" | "left" | "right", value: number) => {
      setSettings((prev) => ({
        ...prev,
        margins: { ...prev.margins, [side]: value },
      }));
    },
    [],
  );

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

  return (
    <GlassDialog
      isOpen
      onBackdropClick={onClose}
      ariaLabel="PDFエクスポート設定"
      panelClassName="mx-4 w-full max-w-lg p-6"
    >
      <div onKeyDown={handleKeyDown}>
      <h2 className="text-lg font-semibold text-foreground mb-4">PDFエクスポート設定</h2>

      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
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

        {/* Chars per line + Lines per page — side by side */}
        <div className="grid grid-cols-2 gap-4">
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

        {/* Indent + Page numbers — side by side */}
        <div className="grid grid-cols-2 gap-4">
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
      <div className="flex justify-end gap-3 mt-6">
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
    </GlassDialog>
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
