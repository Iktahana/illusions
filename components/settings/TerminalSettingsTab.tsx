"use client";

import type React from "react";
import { useTerminalSettings } from "@/contexts/EditorSettingsContext";

/** Label for ANSI color entries displayed in the settings UI. */
const ANSI_COLOR_LABELS: { key: string; label: string }[] = [
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

const FONT_OPTIONS = [
  {
    value: "'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
    label: "JetBrains Mono",
  },
  { value: "'Menlo', 'Monaco', 'Courier New', monospace", label: "Menlo" },
  { value: "'Monaco', 'Courier New', monospace", label: "Monaco" },
  { value: "'SF Mono', 'Menlo', 'Monaco', monospace", label: "SF Mono" },
  { value: "'Fira Code', 'JetBrains Mono', monospace", label: "Fira Code" },
  { value: "'Source Code Pro', 'Menlo', monospace", label: "Source Code Pro" },
  { value: "'Cascadia Code', 'Consolas', monospace", label: "Cascadia Code" },
  { value: "'Courier New', monospace", label: "Courier New" },
];

/**
 * Terminal settings tab — shell, font, cursor, scrollback, ANSI colors.
 * Electron-only feature; all settings are persisted via AppState.
 */
export default function TerminalSettingsTab(): React.ReactElement {
  const {
    terminalBackground,
    terminalForeground,
    terminalFontFamily,
    terminalFontSize,
    terminalLineHeight,
    terminalCursorStyle,
    terminalCursorBlink,
    terminalScrollback,
    terminalCopyOnSelect,
    terminalMacOptionIsMeta,
    terminalDefaultShell,
    terminalAnsiColors,
    onTerminalBackgroundChange,
    onTerminalForegroundChange,
    onTerminalFontFamilyChange,
    onTerminalFontSizeChange,
    onTerminalLineHeightChange,
    onTerminalCursorStyleChange,
    onTerminalCursorBlinkChange,
    onTerminalScrollbackChange,
    onTerminalCopyOnSelectChange,
    onTerminalMacOptionIsMetaChange,
    onTerminalDefaultShellChange,
    onTerminalAnsiColorChange,
    onTerminalAnsiColorsReset,
  } = useTerminalSettings();

  return (
    <div className="space-y-8 p-6">
      {/* Shell設定 */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Shell</h3>
          <p className="text-sm text-foreground-secondary">
            ターミナルで使用するShellや操作の設定を変更します。
          </p>
        </div>

        {/* Default shell */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">デフォルトShell</label>
          <input
            type="text"
            value={terminalDefaultShell}
            onChange={(e) => onTerminalDefaultShellChange(e.target.value)}
            placeholder="自動検出（例: /bin/zsh）"
            className="w-full px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-foreground-muted"
          />
          <p className="text-xs text-foreground-tertiary mt-1">
            空欄の場合はシステムのデフォルトShellを使用します。
          </p>
        </div>

        {/* Copy on select */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={terminalCopyOnSelect}
            onChange={(e) => onTerminalCopyOnSelectChange(e.target.checked)}
            className="w-4 h-4 rounded border-border accent-accent"
          />
          <div>
            <span className="text-sm font-medium text-foreground">選択時に自動コピー</span>
            <p className="text-xs text-foreground-tertiary">
              テキストを選択すると自動的にクリップボードにコピーします。
            </p>
          </div>
        </label>

        {/* macOS Option as Meta */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={terminalMacOptionIsMeta}
            onChange={(e) => onTerminalMacOptionIsMetaChange(e.target.checked)}
            className="w-4 h-4 rounded border-border accent-accent"
          />
          <div>
            <span className="text-sm font-medium text-foreground">
              Option キーを Meta として使用
            </span>
            <p className="text-xs text-foreground-tertiary">
              macOS で Option キーを Alt/Meta キーとして扱います（Emacs キーバインドなどに便利）。
            </p>
          </div>
        </label>
      </div>

      <div className="border-t border-border" />

      {/* フォント設定 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">フォント</h3>

        {/* Font family */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            フォントファミリー
          </label>
          <select
            value={terminalFontFamily}
            onChange={(e) => onTerminalFontFamilyChange(e.target.value)}
            className="w-full px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {FONT_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Font size */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            フォントサイズ{" "}
            <span className="text-foreground-tertiary font-normal">({terminalFontSize}px)</span>
          </label>
          <input
            type="range"
            min={10}
            max={24}
            step={1}
            value={terminalFontSize}
            onChange={(e) => onTerminalFontSizeChange(parseInt(e.target.value, 10))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-xs text-foreground-tertiary mt-1">
            <span>10px</span>
            <span>24px</span>
          </div>
        </div>

        {/* Line height */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            行の高さ{" "}
            <span className="text-foreground-tertiary font-normal">
              ({terminalLineHeight.toFixed(1)})
            </span>
          </label>
          <input
            type="range"
            min={1.0}
            max={2.0}
            step={0.1}
            value={terminalLineHeight}
            onChange={(e) => onTerminalLineHeightChange(parseFloat(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-xs text-foreground-tertiary mt-1">
            <span>1.0（コンパクト）</span>
            <span>2.0（ゆったり）</span>
          </div>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* カーソル設定 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">カーソル</h3>

        {/* Cursor style */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">カーソルスタイル</label>
          <div className="flex gap-2">
            {[
              { value: "block" as const, label: "ブロック", preview: "█" },
              { value: "underline" as const, label: "アンダーライン", preview: "_" },
              { value: "bar" as const, label: "バー", preview: "│" },
            ].map(({ value, label, preview }) => (
              <button
                key={value}
                onClick={() => onTerminalCursorStyleChange(value)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  terminalCursorStyle === value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-foreground-secondary hover:bg-hover"
                }`}
              >
                <span className="font-mono text-lg leading-none">{preview}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Cursor blink */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={terminalCursorBlink}
            onChange={(e) => onTerminalCursorBlinkChange(e.target.checked)}
            className="w-4 h-4 rounded border-border accent-accent"
          />
          <span className="text-sm font-medium text-foreground">カーソルを点滅させる</span>
        </label>
      </div>

      <div className="border-t border-border" />

      {/* スクロールバック */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">スクロールバック</h3>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            最大行数{" "}
            <span className="text-foreground-tertiary font-normal">
              ({terminalScrollback.toLocaleString()} 行)
            </span>
          </label>
          <input
            type="range"
            min={1000}
            max={50000}
            step={1000}
            value={terminalScrollback}
            onChange={(e) => onTerminalScrollbackChange(parseInt(e.target.value, 10))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-xs text-foreground-tertiary mt-1">
            <span>1,000 行</span>
            <span>50,000 行</span>
          </div>
          <p className="text-xs text-foreground-tertiary mt-1">
            値を大きくするとメモリ使用量が増加します。通常は 5,000 行で十分です。
          </p>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* 背景・前景カラー */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">カラー</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">背景色</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={terminalBackground}
                onChange={(e) => onTerminalBackgroundChange(e.target.value)}
                className="w-10 h-10 rounded border border-border cursor-pointer bg-transparent"
              />
              <input
                type="text"
                value={terminalBackground}
                onChange={(e) => onTerminalBackgroundChange(e.target.value)}
                className="flex-1 px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              前景色（テキスト）
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={terminalForeground}
                onChange={(e) => onTerminalForegroundChange(e.target.value)}
                className="w-10 h-10 rounded border border-border cursor-pointer bg-transparent"
              />
              <input
                type="text"
                value={terminalForeground}
                onChange={(e) => onTerminalForegroundChange(e.target.value)}
                className="flex-1 px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* ANSI カラー設定 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">ANSI カラー</h3>
          <button
            onClick={onTerminalAnsiColorsReset}
            className="text-xs px-3 py-1.5 rounded-lg border border-border text-foreground-secondary hover:bg-hover hover:text-foreground transition-colors"
          >
            デフォルトに戻す
          </button>
        </div>
        <p className="text-sm text-foreground-secondary">
          ターミナルで使用される 16 色の ANSI カラーパレットをカスタマイズします。
        </p>

        {/* Standard colors (0-7) */}
        <div>
          <h4 className="text-sm font-medium text-foreground mb-2">標準カラー</h4>
          <div className="grid grid-cols-4 gap-3">
            {ANSI_COLOR_LABELS.slice(0, 8).map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <input
                  type="color"
                  value={terminalAnsiColors[key] ?? "#000000"}
                  onChange={(e) => onTerminalAnsiColorChange(key, e.target.value)}
                  className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                />
                <span className="text-xs text-foreground-secondary">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bright colors (8-15) */}
        <div>
          <h4 className="text-sm font-medium text-foreground mb-2">明るいカラー</h4>
          <div className="grid grid-cols-4 gap-3">
            {ANSI_COLOR_LABELS.slice(8).map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <input
                  type="color"
                  value={terminalAnsiColors[key] ?? "#000000"}
                  onChange={(e) => onTerminalAnsiColorChange(key, e.target.value)}
                  className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent"
                />
                <span className="text-xs text-foreground-secondary">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div
          className="mt-4 p-4 rounded-lg border border-border overflow-hidden"
          style={{ backgroundColor: terminalBackground }}
        >
          <p className="text-xs mb-2" style={{ color: terminalForeground, opacity: 0.5 }}>
            プレビュー
          </p>
          <div
            className="font-mono text-sm leading-relaxed space-y-0.5"
            style={{
              fontFamily: terminalFontFamily,
              fontSize: `${terminalFontSize}px`,
              color: terminalForeground,
            }}
          >
            {ANSI_COLOR_LABELS.slice(0, 8).map(({ key, label }) => (
              <span
                key={key}
                className="inline-block mr-3"
                style={{ color: terminalAnsiColors[key] }}
              >
                {label}
              </span>
            ))}
            <br />
            {ANSI_COLOR_LABELS.slice(8).map(({ key, label }) => (
              <span
                key={key}
                className="inline-block mr-3"
                style={{ color: terminalAnsiColors[key] }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Note about applying changes */}
      <div className="border-t border-border pt-4">
        <p className="text-xs text-foreground-tertiary">
          ※ フォント・カーソル・カラーの変更は、新しく開くターミナルから反映されます。
        </p>
      </div>
    </div>
  );
}
