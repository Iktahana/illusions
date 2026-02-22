"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, EyeOff, Info, ListFilter, RefreshCw, Settings, XCircle } from "lucide-react";
import clsx from "clsx";

import { LINT_PRESETS, LINT_RULES_META } from "@/lib/linting/lint-presets";
import { DEFAULT_POS_COLORS } from "@/packages/milkdown-plugin-japanese-novel/pos-highlight/pos-colors";
import InfoTooltip from "./InfoTooltip";

import type { LintIssue, Severity } from "@/lib/linting";
import type { SeverityFilter, EnrichedLintIssue } from "./types";

interface CorrectionsPanelProps {
  posHighlightEnabled: boolean;
  onPosHighlightEnabledChange?: (enabled: boolean) => void;
  posHighlightColors?: Record<string, string>;
  onOpenPosHighlightSettings?: () => void;
  lintIssues: (LintIssue | EnrichedLintIssue)[];
  onNavigateToIssue?: (issue: LintIssue) => void;
  onApplyFix?: (issue: LintIssue) => void;
  onIgnoreCorrection?: (issue: LintIssue, ignoreAll: boolean) => void;
  onRefreshLinting?: () => void;
  isLinting?: boolean;
  activeLintIssueIndex?: number | null;
  onOpenLintingSettings?: () => void;
  onApplyLintPreset?: (presetId: string) => void;
  activeLintPresetId?: string;
}

/** Returns the display color class for a severity level */
function severityColor(severity: Severity): string {
  switch (severity) {
    case "error":
      return "bg-error";
    case "warning":
      return "bg-warning";
    case "info":
      return "bg-info";
  }
}

/** Get rule display name from metadata */
function getRuleName(ruleId: string): string {
  const meta = LINT_RULES_META.find(r => r.id === ruleId);
  return meta?.nameJa ?? ruleId;
}

/** POS legend items (main categories only, compact) */
const POS_LEGEND_ITEMS = [
  { key: "名詞", label: "名詞" },
  { key: "動詞", label: "動詞" },
  { key: "形容詞", label: "形容詞" },
  { key: "副詞", label: "副詞" },
  { key: "助詞", label: "助詞" },
  { key: "助動詞", label: "助動詞" },
  { key: "接続詞", label: "接続詞" },
  { key: "連体詞", label: "連体詞" },
  { key: "感動詞", label: "感動詞" },
  { key: "記号", label: "記号" },
];

/** Panel for displaying lint corrections and POS highlighting controls */
export default function CorrectionsPanel({
  posHighlightEnabled,
  onPosHighlightEnabledChange,
  posHighlightColors = {},
  onOpenPosHighlightSettings,
  lintIssues,
  onNavigateToIssue,
  onApplyFix,
  onIgnoreCorrection,
  onRefreshLinting,
  isLinting = false,
  activeLintIssueIndex,
  onOpenLintingSettings,
  onApplyLintPreset,
  activeLintPresetId = "",
}: CorrectionsPanelProps) {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const issueListRef = useRef<HTMLDivElement>(null);

  const filteredIssues = useMemo(() =>
    severityFilter === "all"
      ? lintIssues
      : lintIssues.filter((issue) => issue.severity === severityFilter),
    [lintIssues, severityFilter]
  );

  // Find active index within filtered list
  const activeFilteredIndex = useMemo(() => {
    if (activeLintIssueIndex == null) return null;
    const activeIssue = lintIssues[activeLintIssueIndex];
    if (!activeIssue) return null;
    return filteredIssues.indexOf(activeIssue);
  }, [activeLintIssueIndex, lintIssues, filteredIssues]);

  // Auto-scroll active card into view
  useEffect(() => {
    if (activeFilteredIndex == null || activeFilteredIndex < 0) return;
    const container = issueListRef.current;
    if (!container) return;
    const card = container.querySelector(`[data-issue-index="${activeFilteredIndex}"]`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeFilteredIndex]);

  const filterOptions: { value: SeverityFilter; label: string; icon: ReactNode }[] = [
    { value: "all", label: "全て", icon: <ListFilter className="w-3.5 h-3.5" /> },
    { value: "error", label: "エラー", icon: <XCircle className="w-3.5 h-3.5" /> },
    { value: "warning", label: "警告", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    { value: "info", label: "情報", icon: <Info className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-3">
      {/* POS highlight toggle (existing feature) */}
      <div className="bg-background-secondary rounded-lg p-3 border border-border">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">構文ハイライト</h4>
            <p className="text-xs text-foreground-tertiary mt-0.5">
              動詞・助詞などを色分け表示
            </p>
          </div>
          <button
            onClick={() => onPosHighlightEnabledChange?.(!posHighlightEnabled)}
            className={clsx(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              posHighlightEnabled ? "bg-accent" : "bg-foreground-muted"
            )}
          >
            <span
              className={clsx(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                posHighlightEnabled ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </div>
        {posHighlightEnabled && (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {POS_LEGEND_ITEMS.map(({ key, label }) => (
                <span key={key} className="inline-flex items-center gap-1 text-xs text-foreground-secondary">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: posHighlightColors[key] || DEFAULT_POS_COLORS[key] || "#000" }}
                  />
                  {label}
                </span>
              ))}
            </div>
            {onOpenPosHighlightSettings && (
              <button
                onClick={onOpenPosHighlightSettings}
                className="text-xs text-accent hover:text-accent-hover hover:underline transition-colors"
              >
                色の設定を変更
              </button>
            )}
          </div>
        )}
      </div>

      {/* Header: issue count + controls */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-medium text-foreground-secondary">検出結果</h3>
            <span className="text-xs text-foreground-tertiary">
              {lintIssues.length}件
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* Refresh button */}
            {onRefreshLinting && (
              <button
                onClick={onRefreshLinting}
                disabled={isLinting}
                className={clsx(
                  "p-1 rounded transition-colors",
                  isLinting
                    ? "text-accent cursor-wait"
                    : "text-foreground-tertiary hover:text-foreground-secondary hover:bg-hover"
                )}
                title="全文を再検査"
                aria-label="全文を再検査"
              >
                <RefreshCw className={clsx("w-3.5 h-3.5", isLinting && "animate-spin")} />
              </button>
            )}
            {onOpenLintingSettings && (
              <button
                onClick={onOpenLintingSettings}
                className="p-1 text-foreground-tertiary hover:text-foreground-secondary hover:bg-hover rounded transition-colors"
                title="校正設定を開く"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            )}
            {onApplyLintPreset && (
              <select
                value={activeLintPresetId}
                onChange={(e) => {
                  if (e.target.value) {
                    onApplyLintPreset(e.target.value);
                  }
                }}
                className="text-xs px-1.5 py-0.5 border border-border-secondary rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                title="プリセットを適用"
              >
                {!activeLintPresetId && <option value="">カスタム</option>}
                {Object.entries(LINT_PRESETS).map(([id, preset]) => (
                  <option key={id} value={id}>{preset.nameJa}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Severity filter buttons */}
      <div className="flex gap-1">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => setSeverityFilter(option.value)}
            title={option.label}
            aria-label={option.label}
            aria-pressed={severityFilter === option.value}
            className={clsx(
              "flex-1 flex items-center justify-center px-2 py-1.5 rounded transition-colors",
              severityFilter === option.value
                ? "bg-accent text-white"
                : "bg-background-secondary text-foreground-tertiary hover:text-foreground-secondary border border-border"
            )}
          >
            {option.icon}
          </button>
        ))}
      </div>

      {/* Issue list */}
      {filteredIssues.length === 0 ? (
        <div className="pt-4 text-center">
          <p className="text-sm text-foreground-tertiary">問題は検出されませんでした</p>
        </div>
      ) : (
        <div ref={issueListRef} className="space-y-1.5">
          {filteredIssues.map((issue, index) => {
            const enriched = issue as EnrichedLintIssue;
            const isActive = activeFilteredIndex === index;
            const hasOriginal = !!enriched.originalText;
            const hasFix = !!issue.fix;

            return (
              <div
                key={`${issue.ruleId}-${issue.from}-${issue.to}-${index}`}
                data-issue-index={index}
                className={clsx(
                  "rounded-lg border transition-colors",
                  isActive
                    ? "border-accent bg-accent/5"
                    : "border-border bg-background-secondary hover:border-border-secondary"
                )}
              >
                {/* Actions: top-right corner */}
                <div className="flex items-center gap-1 float-right ml-2 mt-2 mr-2">
                  <InfoTooltip
                    content={`${issue.messageJa}${issue.reference ? `\n${issue.reference.standard}${issue.reference.section ? ` ${issue.reference.section}` : ""}` : ""}\n[${getRuleName(issue.ruleId)}]`}
                    className="text-foreground-tertiary hover:text-foreground-secondary"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </InfoTooltip>
                  {hasFix && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onApplyFix?.(issue);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          onApplyFix?.(issue);
                        }
                      }}
                      className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium text-accent hover:text-accent-hover bg-accent/10 hover:bg-accent/20 rounded transition-colors cursor-pointer"
                    >
                      置換
                    </span>
                  )}
                  {onIgnoreCorrection && (
                    <InfoTooltip
                      content="この指摘を無視（右クリックで同じ指摘をすべて無視）"
                      className="text-foreground-tertiary hover:text-foreground-secondary"
                    >
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="この指摘を無視"
                        onClick={(e) => {
                          e.stopPropagation();
                          onIgnoreCorrection(issue, false);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onIgnoreCorrection(issue, true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            onIgnoreCorrection(issue, false);
                          }
                        }}
                        className="inline-flex items-center p-0.5 rounded transition-colors cursor-pointer hover:bg-hover"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                      </span>
                    </InfoTooltip>
                  )}
                </div>
                {/* Main row: click to navigate */}
                <button
                  type="button"
                  onClick={() => onNavigateToIssue?.(issue)}
                  className="w-full text-left px-3 py-2"
                >
                  <div className="flex items-start gap-2">
                    {/* Severity dot */}
                    <span
                      className={clsx(
                        "w-2 h-2 rounded-full shrink-0 mt-1.5",
                        severityColor(issue.severity)
                      )}
                      title={issue.severity}
                    />
                    {/* Content: original → replacement or just message */}
                    <div className="flex-1 min-w-0">
                      {hasOriginal && hasFix ? (
                        <p className="text-sm text-foreground leading-snug">
                          <span className="text-foreground-tertiary line-through">{enriched.originalText}</span>
                          <span className="text-foreground-tertiary mx-1">→</span>
                          <span className="text-foreground font-medium">{issue.fix!.replacement}</span>
                        </p>
                      ) : hasOriginal ? (
                        <p className="text-sm text-foreground leading-snug">
                          {enriched.originalText}
                        </p>
                      ) : (
                        <p className="text-sm text-foreground leading-snug">
                          {issue.messageJa}
                        </p>
                      )}
                      {/* Secondary line: show message when we have original text but no fix */}
                      {hasOriginal && !hasFix && (
                        <p className="text-xs text-foreground-tertiary mt-0.5">
                          {issue.messageJa}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
