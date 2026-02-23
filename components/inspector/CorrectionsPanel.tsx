"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, EyeOff, Info, Lightbulb, ListFilter, Loader2, RefreshCw, Settings, XCircle } from "lucide-react";
import clsx from "clsx";

import { LINT_PRESETS, LINT_RULES_META, LINT_RULE_CATEGORIES } from "@/lib/linting/lint-presets";
import { DEFAULT_POS_COLORS } from "@/packages/milkdown-plugin-japanese-novel/pos-highlight/pos-colors";
import InfoTooltip from "./InfoTooltip";

import type { LintIssue, Severity } from "@/lib/linting";
import type { LintRulePresetConfig } from "@/lib/linting/lint-presets";
import type { SeverityFilter, EnrichedLintIssue } from "./types";

/** Sort mode for the issue list */
type SortMode = "position" | "severity" | "category";

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
  lintingEnabled?: boolean;
  onLintingEnabledChange?: (enabled: boolean) => void;
  lintingRuleConfigs?: Record<string, LintRulePresetConfig>;
  onLintingRuleConfigChange?: (ruleId: string, config: { enabled: boolean; severity: Severity }) => void;
}

const SEVERITY_LABELS: Record<Severity, string> = {
  error: "エラー",
  warning: "警告",
  info: "情報",
};

const SEVERITY_ORDER: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

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

/** Find which category a rule belongs to */
function getCategoryForRule(ruleId: string): typeof LINT_RULE_CATEGORIES[number] | undefined {
  return LINT_RULE_CATEGORIES.find(cat => cat.rules.includes(ruleId));
}

/** Grouped issues by category */
interface IssueGroup {
  categoryId: string;
  categoryName: string;
  ruleIds: string[];
  issues: (LintIssue | EnrichedLintIssue)[];
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

/** Renders a single issue card */
function IssueCard({
  issue,
  isActive,
  onNavigateToIssue,
  onApplyFix,
  onIgnoreCorrection,
}: {
  issue: LintIssue | EnrichedLintIssue;
  isActive: boolean;
  onNavigateToIssue?: (issue: LintIssue) => void;
  onApplyFix?: (issue: LintIssue) => void;
  onIgnoreCorrection?: (issue: LintIssue, ignoreAll: boolean) => void;
}): React.JSX.Element {
  const enriched = issue as EnrichedLintIssue;
  const hasOriginal = !!enriched.originalText;
  const hasFix = !!issue.fix;

  return (
    <div
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
          {/* Severity dot + validation spinner */}
          <span className="relative shrink-0 mt-1.5 w-2 h-2">
            <span
              className={clsx(
                "w-2 h-2 rounded-full block",
                severityColor(issue.severity)
              )}
              title={SEVERITY_LABELS[issue.severity]}
            />
            {issue.llmValidated === undefined && (
              <span className="absolute -top-0.5 -left-0.5" title="確認中">
                <Loader2 className="w-3 h-3 animate-spin text-foreground-tertiary" />
              </span>
            )}
          </span>
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
              <p className="text-sm text-foreground leading-snug flex items-start gap-1">
                <Lightbulb className="w-3.5 h-3.5 text-foreground-tertiary shrink-0 mt-0.5" />
                {issue.messageJa}
              </p>
            )}
            {/* Secondary line: show message when we have original text but no fix */}
            {hasOriginal && !hasFix && (
              <p className="text-xs text-foreground-tertiary mt-0.5 flex items-start gap-1">
                <Lightbulb className="w-3 h-3 shrink-0 mt-0.5" />
                {issue.messageJa}
              </p>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}

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
  lintingEnabled = false,
  onLintingEnabledChange,
  lintingRuleConfigs = {},
  onLintingRuleConfigChange,
}: CorrectionsPanelProps): React.JSX.Element {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("category");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const issueListRef = useRef<HTMLDivElement>(null);

  const filteredIssues = useMemo(() => {
    // Hide issues rejected by LLM validation
    const validated = lintIssues.filter((issue) => issue.llmValidated !== false);
    return severityFilter === "all"
      ? validated
      : validated.filter((issue) => issue.severity === severityFilter);
  }, [lintIssues, severityFilter]);

  /** Sort issues based on the current sort mode */
  const sortedIssues = useMemo(() => {
    const sorted = [...filteredIssues];
    switch (sortMode) {
      case "position":
        sorted.sort((a, b) => a.from - b.from);
        break;
      case "severity":
        sorted.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.from - b.from);
        break;
      case "category":
        // Sorted by category order, then by position within each category
        sorted.sort((a, b) => {
          const catA = LINT_RULE_CATEGORIES.findIndex(c => c.rules.includes(a.ruleId));
          const catB = LINT_RULE_CATEGORIES.findIndex(c => c.rules.includes(b.ruleId));
          if (catA !== catB) return catA - catB;
          return a.from - b.from;
        });
        break;
    }
    return sorted;
  }, [filteredIssues, sortMode]);

  /** Group issues by category */
  const groupedIssues = useMemo((): IssueGroup[] => {
    if (sortMode !== "category") return [];

    const groupMap = new Map<string, IssueGroup>();

    for (const issue of sortedIssues) {
      const category = getCategoryForRule(issue.ruleId);
      const catId = category?.id ?? "other";
      const catName = category?.nameJa ?? "その他";

      let group = groupMap.get(catId);
      if (!group) {
        group = { categoryId: catId, categoryName: catName, ruleIds: [], issues: [] };
        groupMap.set(catId, group);
      }
      if (!group.ruleIds.includes(issue.ruleId)) {
        group.ruleIds.push(issue.ruleId);
      }
      group.issues.push(issue);
    }

    // Maintain the LINT_RULE_CATEGORIES order
    const ordered: IssueGroup[] = [];
    for (const cat of LINT_RULE_CATEGORIES) {
      const group = groupMap.get(cat.id);
      if (group) ordered.push(group);
    }
    const other = groupMap.get("other");
    if (other) ordered.push(other);

    return ordered;
  }, [sortedIssues, sortMode]);

  // Build a global index map so we can find the active issue across groups
  const issueIndexMap = useMemo(() => {
    const map = new Map<LintIssue | EnrichedLintIssue, number>();
    const list = sortMode === "category"
      ? groupedIssues.flatMap(g => g.issues)
      : sortedIssues;
    list.forEach((issue, i) => map.set(issue, i));
    return map;
  }, [sortMode, groupedIssues, sortedIssues]);

  // Find active issue reference from the original lintIssues array
  const activeIssue = useMemo(() => {
    if (activeLintIssueIndex == null) return null;
    return lintIssues[activeLintIssueIndex] ?? null;
  }, [activeLintIssueIndex, lintIssues]);

  // Find global index of active issue in the displayed list
  const activeDisplayIndex = useMemo(() => {
    if (!activeIssue) return null;
    // Find within filtered+sorted issues
    const idx = issueIndexMap.get(activeIssue);
    return idx ?? null;
  }, [activeIssue, issueIndexMap]);

  // Auto-scroll active card into view
  useEffect(() => {
    if (activeDisplayIndex == null) return;
    const container = issueListRef.current;
    if (!container) return;
    const card = container.querySelector(`[data-issue-index="${activeDisplayIndex}"]`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeDisplayIndex]);

  // Auto-expand group containing active issue
  useEffect(() => {
    if (!activeIssue || sortMode !== "category") return;
    const category = getCategoryForRule(activeIssue.ruleId);
    const catId = category?.id ?? "other";
    if (collapsedGroups.has(catId)) {
      setCollapsedGroups(prev => {
        const next = new Set(prev);
        next.delete(catId);
        return next;
      });
    }
    // Only react to activeIssue changes, not collapsedGroups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIssue, sortMode]);

  const toggleGroup = useCallback((categoryId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  /** Disable all rules in a category via settings */
  const handleDisableGroup = useCallback((group: IssueGroup) => {
    if (!onLintingRuleConfigChange) return;
    for (const ruleId of group.ruleIds) {
      const current = lintingRuleConfigs[ruleId];
      const severity = current?.severity ?? "warning";
      onLintingRuleConfigChange(ruleId, { enabled: false, severity });
    }
  }, [onLintingRuleConfigChange, lintingRuleConfigs]);

  const filterOptions: { value: SeverityFilter; label: string; icon: ReactNode }[] = [
    { value: "all", label: "全て", icon: <ListFilter className="w-3.5 h-3.5" /> },
    { value: "error", label: "エラー", icon: <XCircle className="w-3.5 h-3.5" /> },
    { value: "warning", label: "警告", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    { value: "info", label: "情報", icon: <Info className="w-3.5 h-3.5" /> },
  ];

  /** Render a flat list of issue cards */
  const renderFlatList = (): React.JSX.Element => (
    <div ref={issueListRef} className="space-y-1.5">
      {sortedIssues.map((issue, index) => {
        const globalIndex = issueIndexMap.get(issue) ?? index;
        return (
          <div key={`${issue.ruleId}-${issue.from}-${issue.to}-${index}`} data-issue-index={globalIndex} className="animate-fade-in">
            <IssueCard
              issue={issue}
              isActive={activeDisplayIndex === globalIndex}
              onNavigateToIssue={onNavigateToIssue}
              onApplyFix={onApplyFix}
              onIgnoreCorrection={onIgnoreCorrection}
            />
          </div>
        );
      })}
    </div>
  );

  /** Render grouped (by category) and collapsible issue list */
  const renderGroupedList = (): React.JSX.Element => (
    <div ref={issueListRef} className="space-y-2">
      {groupedIssues.map((group) => {
        const isCollapsed = collapsedGroups.has(group.categoryId);
        return (
          <div key={group.categoryId} className="border border-border rounded-lg overflow-hidden">
            {/* Group header */}
            <div className="flex items-center bg-background-secondary">
              <button
                type="button"
                onClick={() => toggleGroup(group.categoryId)}
                className="flex-1 flex items-center gap-1.5 px-3 py-2 text-left hover:bg-hover transition-colors"
              >
                {isCollapsed
                  ? <ChevronRight className="w-3.5 h-3.5 text-foreground-tertiary shrink-0" />
                  : <ChevronDown className="w-3.5 h-3.5 text-foreground-tertiary shrink-0" />
                }
                <span className="text-xs font-medium text-foreground-secondary">{group.categoryName}</span>
                <span className="text-xs text-foreground-tertiary">{group.issues.length}件</span>
              </button>
              {/* Disable entire group */}
              {onLintingRuleConfigChange && (
                <InfoTooltip
                  content={`「${group.categoryName}」のルールをすべて無効にする`}
                  className="text-foreground-tertiary hover:text-foreground-secondary"
                >
                  <button
                    type="button"
                    onClick={() => handleDisableGroup(group)}
                    className="p-1.5 mr-1 text-foreground-tertiary hover:text-foreground-secondary hover:bg-hover rounded transition-colors"
                    aria-label={`${group.categoryName}をすべて無効にする`}
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                </InfoTooltip>
              )}
            </div>
            {/* Group body */}
            {!isCollapsed && (
              <div className="space-y-1.5 p-1.5">
                {group.issues.map((issue, index) => {
                  const globalIndex = issueIndexMap.get(issue) ?? index;
                  return (
                    <div key={`${issue.ruleId}-${issue.from}-${issue.to}-${index}`} data-issue-index={globalIndex} className="animate-fade-in">
                      <IssueCard
                        issue={issue}
                        isActive={activeDisplayIndex === globalIndex}
                        onNavigateToIssue={onNavigateToIssue}
                        onApplyFix={onApplyFix}
                        onIgnoreCorrection={onIgnoreCorrection}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Linting master toggle */}
      <div className="bg-background-secondary rounded-lg p-3 border border-border">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">校正機能</h4>
            <p className="text-xs text-foreground-tertiary mt-0.5">
              文章の問題を自動検出
            </p>
          </div>
          <button
            onClick={() => onLintingEnabledChange?.(!lintingEnabled)}
            className={clsx(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              lintingEnabled ? "bg-accent" : "bg-foreground-muted"
            )}
          >
            <span
              className={clsx(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                lintingEnabled ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </div>
      </div>

      {/* POS highlight toggle (existing feature) */}
      <div className="bg-background-secondary rounded-lg p-3 border border-border">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">品詞ハイライト</h4>
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

      {!lintingEnabled ? (
        <div className="pt-4 text-center">
          <p className="text-sm text-foreground-tertiary">校正機能が無効です</p>
        </div>
      ) : (
      <>
      {/* Header: issue count + controls */}
      <div className="space-y-1.5">
        {/* Row 1: issue count */}
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-medium text-foreground-secondary">検出結果</h3>
          <span className="text-xs text-foreground-tertiary">
            {lintIssues.length}件
          </span>
        </div>
        {/* Row 2: sort + refresh + settings */}
        <div className="flex items-center gap-1">
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="text-xs px-1.5 py-0.5 border border-border-secondary rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            title="並び替え"
          >
            <option value="category">種類別</option>
            <option value="position">出現順</option>
            <option value="severity">重要度順</option>
          </select>
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
        </div>
        {/* Row 3: preset selector */}
        {onApplyLintPreset && (
          <select
            value={activeLintPresetId}
            onChange={(e) => {
              if (e.target.value) {
                onApplyLintPreset(e.target.value);
              }
            }}
            className="text-xs px-1.5 py-0.5 border border-border-secondary rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-accent w-full"
            title="プリセットを適用"
          >
            {!activeLintPresetId && <option value="">カスタム</option>}
            {Object.entries(LINT_PRESETS).map(([id, preset]) => (
              <option key={id} value={id}>{preset.nameJa}</option>
            ))}
          </select>
        )}
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
      ) : sortMode === "category" ? (
        renderGroupedList()
      ) : (
        renderFlatList()
      )}
      </>
      )}
    </div>
  );
}
