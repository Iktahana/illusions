"use client";

import { useState, useCallback, type KeyboardEvent } from "react";
import clsx from "clsx";
import GlassDialog from "./GlassDialog";
import {
  loadDocxExportSettings,
  saveDocxExportSettings,
  PAGE_DIMENSIONS,
} from "@/lib/export/docx-export-settings";

import type { DocxExportSettings, DocxPageSize } from "@/lib/export/docx-export-settings";

interface DocxExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (settings: DocxExportSettings) => void;
}

const PAGE_SIZE_OPTIONS: { value: DocxPageSize; label: string }[] = [
  { value: "A4", label: "A4 (210×297mm)" },
  { value: "A5", label: "A5 (148×210mm)" },
  { value: "B5", label: "B5 (176×250mm)" },
  { value: "B6", label: "B6 (125×176mm)" },
];

const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: "Yu Mincho", label: "游明朝" },
  { value: "Hiragino Mincho ProN", label: "ヒラギノ明朝" },
  { value: "Noto Serif JP", label: "Noto Serif JP" },
  { value: "Yu Gothic", label: "游ゴシック" },
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
export default function DocxExportDialog({ isOpen, onClose, onExport }: DocxExportDialogProps) {
  if (!isOpen) return null;
  return <DocxExportDialogInner onClose={onClose} onExport={onExport} />;
}

function DocxExportDialogInner({ onClose, onExport }: Omit<DocxExportDialogProps, "isOpen">) {
  const [settings, setSettings] = useState<DocxExportSettings>(() => loadDocxExportSettings());

  const updateField = useCallback(
    <K extends keyof DocxExportSettings>(key: K, value: DocxExportSettings[K]) => {
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
    saveDocxExportSettings(settings);
    onExport(settings);
  }, [settings, onExport]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  const dims = PAGE_DIMENSIONS[settings.pageSize] ?? PAGE_DIMENSIONS["A5"];
  const displayW = settings.landscape ? dims.height : dims.width;
  const displayH = settings.landscape ? dims.width : dims.height;

  return (
    <GlassDialog
      isOpen
      onBackdropClick={onClose}
      ariaLabel="DOCXエクスポート設定"
      panelClassName="mx-4 w-full max-w-md p-0 overflow-hidden"
    >
      <div onKeyDown={handleKeyDown} className="flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">DOCXエクスポート設定</h2>
          <p className="text-xs text-foreground-tertiary mt-1">
            {settings.pageSize} ({displayW}×{displayH}mm) ·{" "}
            {settings.landscape ? "横置き" : "縦置き"}
          </p>
        </div>

        {/* Settings */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Paper size */}
          <div>
            <label className={labelClass}>用紙サイズ</label>
            <select
              className={inputClass}
              value={settings.pageSize}
              onChange={(e) => updateField("pageSize", e.target.value as DocxPageSize)}
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

          {/* Font size + Line spacing */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>文字サイズ（pt）</label>
              <input
                type="number"
                className={numberInputClass + " w-full"}
                min={8}
                max={20}
                step={0.5}
                value={settings.fontSize}
                onChange={(e) => updateField("fontSize", clampFloat(e.target.value, 8, 20))}
              />
            </div>
            <div>
              <label className={labelClass}>行間隔</label>
              <input
                type="number"
                className={numberInputClass + " w-full"}
                min={1.0}
                max={3.0}
                step={0.1}
                value={settings.lineSpacing}
                onChange={(e) => updateField("lineSpacing", clampFloat(e.target.value, 1.0, 3.0))}
              />
            </div>
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
                aria-label="ページ番号"
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
