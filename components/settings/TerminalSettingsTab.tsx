"use client";

import type React from "react";
import clsx from "clsx";

import { useTerminalSettings } from "@/contexts/EditorSettingsContext";
import {
  SettingsField,
  SettingsSection,
  SettingsToggle,
  SliderField,
} from "./primitives";
import TerminalAnsiColorGrid from "./terminal/TerminalAnsiColorGrid";

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

const CURSOR_STYLES: ReadonlyArray<{
  value: "block" | "underline" | "bar";
  label: string;
  preview: string;
}> = [
  { value: "block", label: "ブロック", preview: "█" },
  { value: "underline", label: "アンダーライン", preview: "_" },
  { value: "bar", label: "バー", preview: "│" },
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
    <div className="space-y-8">
      <SettingsSection
        title="Shell"
        description="ターミナルで使用する Shell や操作の設定を変更します。"
      >
        <SettingsField
          label="デフォルト Shell"
          description="絶対パス（例: C:\\Windows\\System32\\cmd.exe）または Shell 名（例: powershell、pwsh、cmd、bash、zsh）を入力できます。空欄の場合はシステムのデフォルト Shell を使用します。"
          htmlFor="terminal-default-shell"
        >
          <input
            id="terminal-default-shell"
            type="text"
            value={terminalDefaultShell}
            onChange={(e) => onTerminalDefaultShellChange(e.target.value)}
            placeholder="自動検出（例: powershell、cmd、/bin/zsh）"
            className="w-full px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-foreground-muted"
          />
        </SettingsField>

        <SettingsField
          label="選択時に自動コピー"
          description="テキストを選択すると自動的にクリップボードにコピーします。"
          htmlFor="terminal-copy-on-select"
          inline
        >
          <SettingsToggle
            id="terminal-copy-on-select"
            checked={terminalCopyOnSelect}
            onChange={onTerminalCopyOnSelectChange}
          />
        </SettingsField>

        <SettingsField
          label="Option キーを Meta として使用"
          description="macOS で Option キーを Alt/Meta キーとして扱います（Emacs キーバインドなどに便利）。"
          htmlFor="terminal-mac-option-meta"
          inline
        >
          <SettingsToggle
            id="terminal-mac-option-meta"
            checked={terminalMacOptionIsMeta}
            onChange={onTerminalMacOptionIsMetaChange}
          />
        </SettingsField>
      </SettingsSection>

      <div className="border-t border-border" />

      <SettingsSection title="フォント">
        <SettingsField label="フォントファミリー" htmlFor="terminal-font-family">
          <select
            id="terminal-font-family"
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
        </SettingsField>

        <SliderField
          label="フォントサイズ"
          value={terminalFontSize}
          min={10}
          max={24}
          step={1}
          formatValue={(v) => `${v}px`}
          onChange={onTerminalFontSizeChange}
        />

        <SliderField
          label="行の高さ"
          value={terminalLineHeight}
          min={1.0}
          max={2.0}
          step={0.1}
          formatValue={(v) => v.toFixed(1)}
          onChange={onTerminalLineHeightChange}
        />
      </SettingsSection>

      <div className="border-t border-border" />

      <SettingsSection title="カーソル">
        <SettingsField label="カーソルスタイル">
          <div className="flex gap-2">
            {CURSOR_STYLES.map(({ value, label, preview }) => (
              <button
                key={value}
                type="button"
                onClick={() => onTerminalCursorStyleChange(value)}
                className={clsx(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                  terminalCursorStyle === value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-foreground-secondary hover:bg-hover",
                )}
              >
                <span className="font-mono text-lg leading-none">{preview}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </SettingsField>

        <SettingsField
          label="カーソルを点滅させる"
          htmlFor="terminal-cursor-blink"
          inline
        >
          <SettingsToggle
            id="terminal-cursor-blink"
            checked={terminalCursorBlink}
            onChange={onTerminalCursorBlinkChange}
          />
        </SettingsField>
      </SettingsSection>

      <div className="border-t border-border" />

      <SettingsSection title="スクロールバック">
        <SliderField
          label="最大行数"
          value={terminalScrollback}
          min={1000}
          max={50000}
          step={1000}
          formatValue={(v) => `${v.toLocaleString()} 行`}
          onChange={onTerminalScrollbackChange}
        />
        <p className="text-xs text-foreground-tertiary">
          値を大きくするとメモリ使用量が増加します。通常は 5,000 行で十分です。
        </p>
      </SettingsSection>

      <div className="border-t border-border" />

      <SettingsSection title="カラー">
        <div className="grid grid-cols-2 gap-4">
          <SettingsField label="背景色" htmlFor="terminal-bg">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={terminalBackground}
                onChange={(e) => onTerminalBackgroundChange(e.target.value)}
                className="w-10 h-10 rounded border border-border cursor-pointer bg-transparent"
                aria-label="背景色ピッカー"
              />
              <input
                id="terminal-bg"
                type="text"
                value={terminalBackground}
                onChange={(e) => onTerminalBackgroundChange(e.target.value)}
                className="flex-1 px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </SettingsField>

          <SettingsField label="前景色（テキスト）" htmlFor="terminal-fg">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={terminalForeground}
                onChange={(e) => onTerminalForegroundChange(e.target.value)}
                className="w-10 h-10 rounded border border-border cursor-pointer bg-transparent"
                aria-label="前景色ピッカー"
              />
              <input
                id="terminal-fg"
                type="text"
                value={terminalForeground}
                onChange={(e) => onTerminalForegroundChange(e.target.value)}
                className="flex-1 px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </SettingsField>
        </div>
      </SettingsSection>

      <div className="border-t border-border" />

      <TerminalAnsiColorGrid
        colors={terminalAnsiColors}
        onColorChange={onTerminalAnsiColorChange}
        onReset={onTerminalAnsiColorsReset}
        previewBackground={terminalBackground}
        previewForeground={terminalForeground}
        previewFontFamily={terminalFontFamily}
        previewFontSize={terminalFontSize}
      />

      <div className="border-t border-border pt-4">
        <p className="text-xs text-foreground-tertiary">
          ※ フォント・カーソル・カラーの変更は、新しく開くターミナルから反映されます。
        </p>
      </div>
    </div>
  );
}
