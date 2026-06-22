"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  EyeOff,
  Info,
  ListFilter,
  RefreshCw,
  Settings,
  XCircle,
} from "lucide-react";
import clsx from "clsx";

import { CORRECTION_MODE_IDS, CORRECTION_MODES } from "@/lib/linting/correction-modes";
import { useRuleSourceMap } from "@/lib/editor-page/use-rule-source-map";
import { isElectronRenderer } from "@/lib/utils/runtime-env";
import type { CorrectionModeId } from "@/lib/linting/correction-config";
import { DEFAULT_POS_COLORS } from "@/packages/milkdown-plugin-japanese-novel/pos-highlight/pos-colors";
import InfoTooltip from "./InfoTooltip";
import IssueCard from "./IssueCard";
import IgnoredCorrectionsDialog from "./IgnoredCorrectionsDialog";
import {
  useLintingSettings,
  usePosHighlightSettings,
  usePowerSettings,
} from "@/contexts/EditorSettingsContext";
import { useIgnoredCorrectionsContext } from "@/contexts/IgnoredCorrectionsContext";

import type { LintIssue, Severity } from "@/lib/linting";
import type { SeverityFilter, EnrichedLintIssue } from "./types";

/** Sort mode for the issue list */
type SortMode = "position" | "severity" | "source";

/** Group id used when a rule's owning ruleset cannot be determined. */
const OTHER_GROUP_ID = "other";
const OTHER_GROUP_NAME = "その他";

interface CorrectionsPanelProps {
  onOpenPosHighlightSettings?: () => void;
  onOpenPowerSettings?: () => void;
  lintIssues: (LintIssue | EnrichedLintIssue)[];
  onNavigateToIssue?: (issue: LintIssue) => void;
  onApplyFix?: (issue: LintIssue) => void;
  onIgnoreCorrection?: (issue: LintIssue, ignoreAll: boolean) => void;
  onRefreshLinting?: () => void;
  isLinting?: boolean;
  activeLintIssueIndex?: number | null;
  onOpenLintingSettings?: () => void;
  correctionMode?: CorrectionModeId;
  onCorrectionModeChange?: (modeId: CorrectionModeId) => void;
}

const SEVERITY_ORDER: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/** Issues grouped by their owning ruleset (出典). */
interface IssueGroup {
  groupId: string;
  groupName: string;
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

/** Panel for displaying lint corrections and POS highlighting controls */
export default function CorrectionsPanel({
  onOpenPosHighlightSettings,
  onOpenPowerSettings,
  lintIssues,
  onNavigateToIssue,
  onApplyFix,
  onIgnoreCorrection,
  onRefreshLinting,
  isLinting = false,
  activeLintIssueIndex,
  onOpenLintingSettings,
  correctionMode,
  onCorrectionModeChange,
}: CorrectionsPanelProps): React.JSX.Element {
  const {
    posHighlightEnabled,
    posHighlightColors,
    posHighlightDisabledTypes,
    onPosHighlightEnabledChange,
    onPosHighlightDisabledTypesChange,
  } = usePosHighlightSettings();
  const { lintingEnabled, lintingRuleConfigs, onLintingEnabledChange, onLintingRuleConfigChange } =
    useLintingSettings();
  const { powerSaveMode, onTemporarilyDisablePowerSave } = usePowerSettings();
  const ignoredCorrections = useIgnoredCorrectionsContext();
  const ruleSourceMap = useRuleSourceMap();
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("source");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showIgnoredDialog, setShowIgnoredDialog] = useState(false);
  const issueListRef = useRef<HTMLDivElement>(null);

  const filteredIssues = useMemo(() => {
    return severityFilter === "all"
      ? lintIssues
      : lintIssues.filter((issue) => issue.severity === severityFilter);
  }, [lintIssues, severityFilter]);

  /** Sort issues based on the current sort mode */
  const sortedIssues = useMemo(() => {
    const sorted = [...filteredIssues];
    switch (sortMode) {
      case "position":
        sorted.sort((a, b) => a.from - b.from);
        break;
      case "severity":
        sorted.sort(
          (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.from - b.from,
        );
        break;
      case "source":
        // Grouped by owning ruleset (出典), then by position within each source.
        sorted.sort((a, b) => {
          const srcA = ruleSourceMap.get(a.ruleId)?.id ?? OTHER_GROUP_ID;
          const srcB = ruleSourceMap.get(b.ruleId)?.id ?? OTHER_GROUP_ID;
          if (srcA !== srcB) return srcA.localeCompare(srcB);
          return a.from - b.from;
        });
        break;
    }
    return sorted;
  }, [filteredIssues, sortMode, ruleSourceMap]);

  /** Group issues by their owning ruleset (出典) */
  const groupedIssues = useMemo((): IssueGroup[] => {
    if (sortMode !== "source") return [];

    const groupMap = new Map<string, IssueGroup>();

    for (const issue of sortedIssues) {
      const source = ruleSourceMap.get(issue.ruleId);
      const groupId = source?.id ?? OTHER_GROUP_ID;
      const groupName = source?.nameJa ?? OTHER_GROUP_NAME;

      let group = groupMap.get(groupId);
      if (!group) {
        group = { groupId, groupName, ruleIds: [], issues: [] };
        groupMap.set(groupId, group);
      }
      if (!group.ruleIds.includes(issue.ruleId)) {
        group.ruleIds.push(issue.ruleId);
      }
      group.issues.push(issue);
    }

    // 出典名の昇順で並べ、"その他" は常に末尾に置く。
    const groups = [...groupMap.values()];
    groups.sort((a, b) => {
      if (a.groupId === OTHER_GROUP_ID) return 1;
      if (b.groupId === OTHER_GROUP_ID) return -1;
      return a.groupName.localeCompare(b.groupName, "ja");
    });

    return groups;
  }, [sortedIssues, sortMode, ruleSourceMap]);

  // Build a global index map so we can find the active issue across groups
  const issueIndexMap = useMemo(() => {
    const map = new Map<LintIssue | EnrichedLintIssue, number>();
    const list = sortMode === "source" ? groupedIssues.flatMap((g) => g.issues) : sortedIssues;
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
    if (!activeIssue || sortMode !== "source") return;
    const groupId = ruleSourceMap.get(activeIssue.ruleId)?.id ?? OTHER_GROUP_ID;
    if (collapsedGroups.has(groupId)) {
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    }
    // Only react to activeIssue changes, not collapsedGroups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIssue, sortMode, ruleSourceMap]);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  /** Disable all rules in a source group via settings */
  const handleDisableGroup = useCallback(
    (group: IssueGroup) => {
      if (!onLintingRuleConfigChange) return;
      for (const ruleId of group.ruleIds) {
        const current = lintingRuleConfigs[ruleId];
        const severity = current?.severity ?? "warning";
        onLintingRuleConfigChange(ruleId, { enabled: false, severity });
      }
    },
    [onLintingRuleConfigChange, lintingRuleConfigs],
  );

  const filterOptions: { value: SeverityFilter; label: string; icon: ReactNode }[] = [
    { value: "all", label: "全て", icon: <ListFilter className="w-3.5 h-3.5" /> },
    { value: "error", label: "エラー", icon: <XCircle className="w-3.5 h-3.5" /> },
    { value: "warning", label: "警告", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    { value: "info", label: "情報", icon: <Info className="w-3.5 h-3.5" /> },
  ];

  // Web 版には校正ルールが供給されない（ルールセットはデスクトップ版のみ）。
  // 0 件を「問題なし」と誤認させないよう、空状態で desktop-only を明示する (#1833)。
  const isElectron = isElectronRenderer();

  /** Render a flat list of issue cards */
  const renderFlatList = (): React.JSX.Element => (
    <div ref={issueListRef} className="space-y-1.5">
      {sortedIssues.map((issue, index) => {
        const globalIndex = issueIndexMap.get(issue) ?? index;
        return (
          <div
            key={`${issue.ruleId}-${issue.from}-${issue.to}-${index}`}
            data-issue-index={globalIndex}
            className="animate-fade-in"
          >
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

  /** Render grouped (by 出典/ruleset) and collapsible issue list */
  const renderGroupedList = (): React.JSX.Element => (
    <div ref={issueListRef} className="space-y-2">
      {groupedIssues.map((group) => {
        const isCollapsed = collapsedGroups.has(group.groupId);
        return (
          <div key={group.groupId} className="border border-border rounded-lg overflow-hidden">
            {/* Group header */}
            <div className="flex items-center bg-background-secondary">
              <button
                type="button"
                onClick={() => toggleGroup(group.groupId)}
                className="flex-1 flex items-center gap-1.5 px-3 py-2 text-left hover:bg-hover transition-colors"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5 text-foreground-tertiary shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-foreground-tertiary shrink-0" />
                )}
                <span className="text-xs font-medium text-foreground-secondary">
                  {group.groupName}
                </span>
                <span className="text-xs text-foreground-tertiary">{group.issues.length}件</span>
              </button>
              {/* Disable entire group */}
              <InfoTooltip
                content={`「${group.groupName}」のルールをすべて無効にする`}
                className="text-foreground-tertiary hover:text-foreground-secondary"
              >
                <button
                  type="button"
                  onClick={() => handleDisableGroup(group)}
                  className="p-1.5 mr-1 text-foreground-tertiary hover:text-foreground-secondary hover:bg-hover rounded transition-colors"
                  aria-label={`${group.groupName}をすべて無効にする`}
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </button>
              </InfoTooltip>
            </div>
            {/* Group body */}
            {!isCollapsed && (
              <div className="space-y-1.5 p-1.5">
                {group.issues.map((issue, index) => {
                  const globalIndex = issueIndexMap.get(issue) ?? index;
                  return (
                    <div
                      key={`${issue.ruleId}-${issue.from}-${issue.to}-${index}`}
                      data-issue-index={globalIndex}
                      className="animate-fade-in"
                    >
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
            <p className="text-xs text-foreground-tertiary mt-0.5">文章の問題を自動検出</p>
          </div>
          <button
            onClick={() => onLintingEnabledChange?.(!lintingEnabled)}
            className={clsx(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
              lintingEnabled ? "bg-accent" : "bg-foreground-muted",
            )}
          >
            <span
              className={clsx(
                "inline-block h-4 w-4 transform rounded-full transition-transform shadow-sm",
                lintingEnabled ? "translate-x-6 bg-accent-foreground" : "translate-x-1 bg-white",
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
            <p className="text-xs text-foreground-tertiary mt-0.5">動詞・助詞などを色分け表示</p>
          </div>
          <button
            onClick={() => onPosHighlightEnabledChange?.(!posHighlightEnabled)}
            className={clsx(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
              posHighlightEnabled ? "bg-accent" : "bg-foreground-muted",
            )}
          >
            <span
              className={clsx(
                "inline-block h-4 w-4 transform rounded-full transition-transform shadow-sm",
                posHighlightEnabled
                  ? "translate-x-6 bg-accent-foreground"
                  : "translate-x-1 bg-white",
              )}
            />
          </button>
        </div>
        {posHighlightEnabled && (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {POS_LEGEND_ITEMS.map(({ key, label }) => {
                const isDisabled = posHighlightDisabledTypes.includes(key);
                return (
                  <button
                    key={key}
                    className={clsx(
                      "inline-flex items-center gap-1 text-xs transition-opacity cursor-pointer",
                      isDisabled ? "opacity-40 text-foreground-muted" : "text-foreground-secondary",
                    )}
                    title={isDisabled ? "クリックで表示" : "クリックで非表示"}
                    onClick={() => {
                      const next = isDisabled
                        ? posHighlightDisabledTypes.filter((t) => t !== key)
                        : [...posHighlightDisabledTypes, key];
                      onPosHighlightDisabledTypesChange(next);
                    }}
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-sm"
                      style={{
                        backgroundColor: isDisabled
                          ? "#ccc"
                          : posHighlightColors[key] || DEFAULT_POS_COLORS[key] || "#000",
                      }}
                    />
                    {label}
                  </button>
                );
              })}
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
        powerSaveMode ? (
          <div className="bg-background-secondary mt-1 rounded-lg border border-border p-3 text-center">
            <p className="text-sm text-foreground-secondary">省電力モードのため停止中です</p>
            <p className="mt-1 text-xs text-foreground-tertiary">
              バッテリー節約のため校正機能を一時停止しています。
            </p>
            <div className="mt-3 flex flex-col items-stretch gap-1.5">
              <button
                onClick={() => onTemporarilyDisablePowerSave?.()}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
              >
                5分間だけ有効にする
              </button>
              {onOpenPowerSettings && (
                <button
                  onClick={onOpenPowerSettings}
                  className="text-xs text-accent transition-colors hover:text-accent-hover hover:underline"
                >
                  省電力設定を開く
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="pt-4 text-center">
            <p className="text-sm text-foreground-tertiary">校正機能が無効です</p>
          </div>
        )
      ) : (
        <>
          {/* Header: issue count + controls */}
          <div className="space-y-1.5">
            {/* Row 1: issue count */}
            <div className="flex items-center gap-1">
              <h3 className="text-sm font-medium text-foreground-secondary">検出結果</h3>
              <span className="text-xs text-foreground-tertiary">{lintIssues.length}件</span>
            </div>
            {/* Row 1b: correction mode selector */}
            {onCorrectionModeChange && (
              <select
                value={correctionMode ?? "novel"}
                onChange={(e) => onCorrectionModeChange(e.target.value as CorrectionModeId)}
                className="w-full text-xs px-1.5 py-1 border border-border-secondary rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                title="校正モード"
              >
                {CORRECTION_MODE_IDS.map((modeId) => (
                  <option key={modeId} value={modeId}>
                    {CORRECTION_MODES[modeId].nameJa}
                  </option>
                ))}
              </select>
            )}
            {/* Row 2: sort + refresh + settings */}
            <div className="flex items-center gap-1">
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="text-xs px-1.5 py-0.5 border border-border-secondary rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                title="並び替え"
              >
                <option value="source">出典別</option>
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
                      : "text-foreground-tertiary hover:text-foreground-secondary hover:bg-hover",
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
                    ? "bg-accent text-accent-foreground"
                    : "bg-background-tertiary text-foreground-secondary hover:text-foreground border border-border-secondary",
                )}
              >
                {option.icon}
              </button>
            ))}
          </div>

          {/* Issue list */}
          {filteredIssues.length === 0 ? (
            !isElectron ? (
              <div className="pt-4 text-center">
                <p className="text-sm text-foreground-secondary">
                  校正ルールはデスクトップ版で利用できます
                </p>
                <p className="mt-1 text-xs text-foreground-tertiary">
                  Web
                  版には校正ルールセットが含まれていません。デスクトップ版で公式ルールセットをインストールすると校正が利用できます。
                </p>
              </div>
            ) : (
              <div className="pt-4 text-center">
                <p className="text-sm text-foreground-tertiary">問題は検出されませんでした</p>
              </div>
            )
          ) : sortMode === "source" ? (
            renderGroupedList()
          ) : (
            renderFlatList()
          )}

          {/* Ignored corrections entry point */}
          {ignoredCorrections && (
            <div className="pt-3 text-center">
              <button
                type="button"
                onClick={() => setShowIgnoredDialog(true)}
                className="text-xs text-accent transition-colors hover:text-accent-hover hover:underline"
              >
                無視された指摘
                {ignoredCorrections.items.length > 0 && `（${ignoredCorrections.items.length}件）`}
              </button>
            </div>
          )}
        </>
      )}

      {ignoredCorrections && (
        <IgnoredCorrectionsDialog
          isOpen={showIgnoredDialog}
          onClose={() => setShowIgnoredDialog(false)}
        />
      )}
    </div>
  );
}
