"use client";

import type React from "react";

/**
 * Label for ANSI color entries displayed in the grid.
 *
 * The `key` is the camelCase name used in the terminal color map
 * (`black`, `brightBlack`, …). It is passed through to `onColorChange`
 * unchanged — the component never converts to the `terminalColor{Key}`
 * AppState field name. That translation is the caller's responsibility.
 */
const ANSI_COLOR_LABELS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "black", label: "黒" },
  { key: "red", label: "赤" },
  { key: "green", label: "緑" },
  { key: "yellow", label: "黄" },
  { key: "blue", label: "青" },
  { key: "magenta", label: "マゼンタ" },
  { key: "cyan", label: "シアン" },
  { key: "white", label: "白" },
  { key: "brightBlack", label: "明るい黒" },
  { key: "brightRed", label: "明るい赤" },
  { key: "brightGreen", label: "明るい緑" },
  { key: "brightYellow", label: "明るい黄" },
  { key: "brightBlue", label: "明るい青" },
  { key: "brightMagenta", label: "明るいマゼンタ" },
  { key: "brightCyan", label: "明るいシアン" },
  { key: "brightWhite", label: "明るい白" },
];

export interface TerminalAnsiColorGridProps {
  /** camelCase ANSI color key → hex color value. */
  colors: Record<string, string>;
  /**
   * Invoked with the raw camelCase key (e.g. `"brightBlack"`) and new hex
   * value. Does not translate to AppState field names.
   */
  onColorChange: (key: string, value: string) => void;
  onReset: () => void;
  /**
   * Context for the preview swatch. Purely presentational — do not rely on
   * these as canonical values.
   */
  previewForeground: string;
  previewBackground: string;
  previewFontFamily: string;
  previewFontSize: number;
}

export default function TerminalAnsiColorGrid({
  colors,
  onColorChange,
  onReset,
  previewForeground,
  previewBackground,
  previewFontFamily,
  previewFontSize,
}: TerminalAnsiColorGridProps): React.ReactElement {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">ANSI カラー</h3>
        <button
          onClick={onReset}
          className="text-xs px-3 py-1.5 rounded-lg border border-border text-foreground-secondary hover:bg-hover hover:text-foreground transition-colors"
        >
          デフォルトに戻す
        </button>
      </div>
      <p className="text-xs text-foreground-tertiary">
        ターミナルで使用される 16 色の ANSI カラーパレットをカスタマイズします。
      </p>

      <div>
        <h4 className="text-xs font-medium text-foreground-secondary mb-2">標準カラー</h4>
        <div className="grid grid-cols-4 gap-3">
          {ANSI_COLOR_LABELS.slice(0, 8).map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2">
              <input
                type="color"
                value={colors[key] ?? "#000000"}
                onChange={(e) => onColorChange(key, e.target.value)}
                className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                aria-label={label}
              />
              <span className="text-xs text-foreground-secondary">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-xs font-medium text-foreground-secondary mb-2">明るいカラー</h4>
        <div className="grid grid-cols-4 gap-3">
          {ANSI_COLOR_LABELS.slice(8).map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2">
              <input
                type="color"
                value={colors[key] ?? "#000000"}
                onChange={(e) => onColorChange(key, e.target.value)}
                className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                aria-label={label}
              />
              <span className="text-xs text-foreground-secondary">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        className="mt-4 p-4 rounded-lg border border-border overflow-hidden"
        style={{ backgroundColor: previewBackground }}
      >
        <p className="text-xs mb-2" style={{ color: previewForeground, opacity: 0.5 }}>
          プレビュー
        </p>
        <div
          className="font-mono leading-relaxed space-y-0.5"
          style={{
            fontFamily: previewFontFamily,
            fontSize: `${previewFontSize}px`,
            color: previewForeground,
          }}
        >
          {ANSI_COLOR_LABELS.slice(0, 8).map(({ key, label }) => (
            <span key={key} className="inline-block mr-3" style={{ color: colors[key] }}>
              {label}
            </span>
          ))}
          <br />
          {ANSI_COLOR_LABELS.slice(8).map(({ key, label }) => (
            <span key={key} className="inline-block mr-3" style={{ color: colors[key] }}>
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
