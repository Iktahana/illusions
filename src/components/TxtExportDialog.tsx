"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import GlassDialog from "@/shared/ui/GlassDialog";
import {
  loadExportSettings,
  saveExportSettings,
  DEFAULT_EXPORT_SETTINGS,
} from "@/lib/export/export-settings";
import type { UnifiedExportSettings } from "@/lib/export/export-settings";
import type { TxtExportFormat, TxtIndentOptions } from "@/lib/export/txt-export-types";

interface TxtExportDialogProps {
  isOpen: boolean;
  /** Which TXT variant is being exported (affects only the heading). */
  format: TxtExportFormat;
  /** Called with the chosen 字下げ options when the user confirms. */
  onConfirm: (options: TxtIndentOptions) => void;
  /** Called when the user cancels or dismisses the dialog. */
  onCancel: () => void;
}

const MIN_COUNT = 1;
const MAX_COUNT = 4;

function clampCount(value: number): number {
  if (!Number.isFinite(value)) return MIN_COUNT;
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.round(value)));
}

/**
 * Lightweight dialog shown before a TXT / TXT(ruby) export. Asks whether to
 * apply literal full-width-space (U+3000) 字下げ and, if so, how many spaces.
 * Choices are persisted in the unified export settings so they are remembered.
 */
export default function TxtExportDialog({
  isOpen,
  format,
  onConfirm,
  onCancel,
}: TxtExportDialogProps): React.ReactNode {
  const [fullwidth, setFullwidth] = useState<boolean>(
    DEFAULT_EXPORT_SETTINGS.txtFullwidthSpaceIndent,
  );
  const [count, setCount] = useState<number>(DEFAULT_EXPORT_SETTINGS.txtIndentCount);
  // Snapshot of the full settings object so confirm-time persistence does not
  // clobber unrelated (PDF/DOCX/EPUB) fields.
  const loadedRef = useRef<UnifiedExportSettings>(DEFAULT_EXPORT_SETTINGS);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void loadExportSettings().then((loaded) => {
      if (cancelled) return;
      loadedRef.current = loaded;
      setFullwidth(loaded.txtFullwidthSpaceIndent);
      setCount(clampCount(loaded.txtIndentCount));
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = (): void => {
    const indentCount = clampCount(count);
    void saveExportSettings({
      ...loadedRef.current,
      txtFullwidthSpaceIndent: fullwidth,
      txtIndentCount: indentCount,
    });
    onConfirm({ fullwidthSpaceIndent: fullwidth, indentCount });
  };

  const labelClass = "block text-sm font-medium text-foreground-secondary mb-1";

  return (
    <GlassDialog
      isOpen
      onBackdropClick={onCancel}
      ariaLabel="テキストエクスポート設定"
      panelClassName="mx-4 w-full max-w-md p-6"
    >
      <h2 className="text-lg font-semibold text-foreground mb-1">
        {format === "txt-ruby"
          ? "テキスト（ルビ付き）エクスポート"
          : format === "narou"
            ? "小説家になろう形式エクスポート"
            : format === "kakuyomu"
              ? "カクヨム形式エクスポート"
              : format === "aozora"
                ? "青空文庫形式エクスポート"
                : "テキストエクスポート"}
      </h2>
      <p className="text-xs text-foreground-tertiary mb-4">字下げの方法を選択してください。</p>

      <div className="space-y-4">
        {/* Full-width-space toggle */}
        <div className="flex items-center justify-between">
          <label className={labelClass + " mb-0"}>全角スペースで字下げする</label>
          <button
            type="button"
            role="switch"
            aria-checked={fullwidth}
            onClick={() => setFullwidth((v) => !v)}
            className={clsx(
              "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors",
              fullwidth ? "bg-accent" : "bg-border-secondary",
            )}
          >
            <span
              className={clsx(
                "inline-block h-5 w-5 transform rounded-full bg-background transition-transform",
                fullwidth ? "translate-x-6" : "translate-x-1",
              )}
            />
          </button>
        </div>

        {/* Space count (only when enabled) */}
        {fullwidth && (
          <div>
            <label className={labelClass}>字数（全角スペースの数）</label>
            <input
              type="number"
              className="w-full px-3 py-2 rounded-lg text-sm bg-background-secondary border border-border text-foreground"
              min={MIN_COUNT}
              max={MAX_COUNT}
              step={1}
              value={count}
              onChange={(e) => setCount(clampCount(Number(e.target.value)))}
            />
            <p className="text-xs text-foreground-tertiary mt-1">
              各段落の先頭に全角スペース（U+3000）を{clampCount(count)}個挿入します。
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-2">
        <button
          type="button"
          className="w-full px-4 py-2 rounded-lg text-sm bg-accent text-accent-foreground hover:bg-accent-hover transition-colors"
          onClick={handleConfirm}
        >
          エクスポート
        </button>
        <button
          type="button"
          className="w-full px-4 py-2 rounded-lg text-sm text-foreground-secondary hover:bg-hover transition-colors"
          onClick={onCancel}
        >
          キャンセル
        </button>
      </div>
    </GlassDialog>
  );
}
