"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, MessageSquareOff, MessageSquare } from "lucide-react";
import clsx from "clsx";

import type { Severity } from "@/lib/linting/types";
import {
  LINT_RULES_META,
  LINT_RULE_CATEGORIES,
  LINT_PRESETS,
  LINT_DEFAULT_CONFIGS,
} from "@/lib/linting/lint-presets";

/** Set of rule IDs that belong to the AI category */
const AI_RULE_IDS = new Set(
  LINT_RULE_CATEGORIES.find((c) => c.id === "ai")?.rules ?? [],
);

/** Map of rule ID → supportsSkipDialogue from metadata */
const SKIP_DIALOGUE_SUPPORT = new Map(
  LINT_RULES_META.map((r) => [r.id, r.supportsSkipDialogue ?? false]),
);

interface LintingSettingsProps {
  lintingEnabled: boolean;
  onLintingEnabledChange: (value: boolean) => void;
  lintingRuleConfigs: Record<string, { enabled: boolean; severity: Severity; skipDialogue?: boolean }>;
  onLintingRuleConfigChange: (ruleId: string, config: { enabled: boolean; severity: Severity; skipDialogue?: boolean }) => void;
  onLintingRuleConfigsBatchChange: (configs: Record<string, { enabled: boolean; severity: Severity; skipDialogue?: boolean }>) => void;
  llmEnabled?: boolean;
}

/** Resolve the effective config for a rule, falling back to defaults */
function getConfig(
  ruleId: string,
  configs: Record<string, { enabled: boolean; severity: Severity; skipDialogue?: boolean }>,
): { enabled: boolean; severity: Severity; skipDialogue?: boolean } {
  return configs[ruleId] ?? LINT_DEFAULT_CONFIGS[ruleId] ?? { enabled: true, severity: "warning" };
}

export default function LintingSettings({
  lintingEnabled,
  onLintingEnabledChange,
  lintingRuleConfigs,
  onLintingRuleConfigChange,
  onLintingRuleConfigsBatchChange,
  llmEnabled,
}: LintingSettingsProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  /** Toggle all rules in a category */
  const toggleCategoryEnabled = (ruleIds: string[], enabled: boolean) => {
    const next = { ...lintingRuleConfigs };
    for (const ruleId of ruleIds) {
      const current = getConfig(ruleId, next);
      next[ruleId] = { ...current, enabled };
    }
    onLintingRuleConfigsBatchChange(next);
  };

  /** Check if all rules in a category are enabled */
  const isCategoryAllEnabled = (ruleIds: string[]): boolean =>
    ruleIds.every(id => getConfig(id, lintingRuleConfigs).enabled);

  /** Count enabled rules in a category */
  const categoryEnabledCount = (ruleIds: string[]): number =>
    ruleIds.filter(id => getConfig(id, lintingRuleConfigs).enabled).length;

  const handleApplyPreset = (presetId: string) => {
    const preset = LINT_PRESETS[presetId];
    if (preset) {
      onLintingRuleConfigsBatchChange({ ...preset.configs });
    }
  };

  const handleEnableAll = () => {
    const next: Record<string, { enabled: boolean; severity: Severity; skipDialogue?: boolean }> = {};
    for (const rule of LINT_RULES_META) {
      const current = getConfig(rule.id, lintingRuleConfigs);
      next[rule.id] = { ...current, enabled: true };
    }
    onLintingRuleConfigsBatchChange(next);
  };

  const handleDisableAll = () => {
    const next: Record<string, { enabled: boolean; severity: Severity; skipDialogue?: boolean }> = {};
    for (const rule of LINT_RULES_META) {
      const current = getConfig(rule.id, lintingRuleConfigs);
      next[rule.id] = { ...current, enabled: false };
    }
    onLintingRuleConfigsBatchChange(next);
  };

  const handleResetDefaults = () => {
    onLintingRuleConfigsBatchChange({ ...LINT_DEFAULT_CONFIGS });
  };

  const ruleMetaMap = new Map(LINT_RULES_META.map(r => [r.id, r]));

  /** Detect which preset matches the current config (if any) */
  const activePresetId = useMemo(() => {
    for (const [id, preset] of Object.entries(LINT_PRESETS)) {
      const allMatch = LINT_RULES_META.every((rule) => {
        const current = getConfig(rule.id, lintingRuleConfigs);
        const presetCfg = preset.configs[rule.id];
        if (!presetCfg) return false;
        return (
          current.enabled === presetCfg.enabled &&
          current.severity === presetCfg.severity &&
          (current.skipDialogue ?? false) === (presetCfg.skipDialogue ?? false)
        );
      });
      if (allMatch) return id;
    }
    return "";
  }, [lintingRuleConfigs]);

  return (
    <div className="space-y-6">
      {/* Master toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">
            校正機能を有効にする
          </h3>
          <p className="text-xs text-foreground-tertiary mt-0.5">
            テキストの校正ルールを適用します
          </p>
        </div>
        <button
          onClick={() => onLintingEnabledChange(!lintingEnabled)}
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

      {/* Rules section */}
      <div
        className={clsx(
          "space-y-4 pt-4 border-t border-border transition-opacity",
          !lintingEnabled && "opacity-50 pointer-events-none"
        )}
      >
        {/* Preset dropdown + bulk actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={activePresetId}
            onChange={(e) => {
              if (e.target.value) {
                handleApplyPreset(e.target.value);
              }
            }}
            className="text-xs px-2 py-1.5 border border-border-secondary rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {!activePresetId && <option value="">カスタム</option>}
            {Object.entries(LINT_PRESETS).map(([id, preset]) => (
              <option key={id} value={id}>{preset.nameJa}</option>
            ))}
          </select>
          <div className="flex-1" />
          <button
            onClick={handleEnableAll}
            className="text-xs px-2 py-1 text-foreground-secondary hover:text-foreground hover:bg-hover rounded transition-colors"
          >
            すべて有効
          </button>
          <span className="text-border-secondary text-xs">|</span>
          <button
            onClick={handleDisableAll}
            className="text-xs px-2 py-1 text-foreground-secondary hover:text-foreground hover:bg-hover rounded transition-colors"
          >
            すべて無効
          </button>
          <span className="text-border-secondary text-xs">|</span>
          <button
            onClick={handleResetDefaults}
            className="text-xs px-2 py-1 text-foreground-secondary hover:text-foreground hover:bg-hover rounded transition-colors"
          >
            デフォルト
          </button>
        </div>

        {/* Grouped rules */}
        {LINT_RULE_CATEGORIES.map((category) => {
          const isCollapsed = collapsedGroups.has(category.id);
          const enabledCount = categoryEnabledCount(category.rules);
          const allEnabled = isCategoryAllEnabled(category.rules);

          return (
            <div key={category.id} className="border border-border rounded-lg overflow-hidden">
              {/* Category header */}
              <div className="flex items-center gap-2 px-3 py-2.5 bg-background-tertiary/50">
                <button
                  onClick={() => toggleGroup(category.id)}
                  className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-foreground-tertiary flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-foreground-tertiary flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium text-foreground">
                    {category.nameJa}
                  </span>
                  <span className="text-xs text-foreground-tertiary ml-1">
                    {enabledCount}/{category.rules.length}
                  </span>
                </button>
                <button
                  onClick={() => toggleCategoryEnabled(category.rules, !allEnabled)}
                  className={clsx(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0",
                    allEnabled ? "bg-accent" : "bg-foreground-muted"
                  )}
                >
                  <span
                    className={clsx(
                      "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm",
                      allEnabled ? "translate-x-5" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>

              {/* Rules table */}
              {!isCollapsed && (
                <div className="divide-y divide-border">
                  {category.rules.map((ruleId) => {
                    const meta = ruleMetaMap.get(ruleId);
                    if (!meta) return null;
                    const config = getConfig(ruleId, lintingRuleConfigs);
                    const isAiRule = AI_RULE_IDS.has(ruleId);
                    const aiDisabled = isAiRule && !llmEnabled;
                    const showDialogueToggle = SKIP_DIALOGUE_SUPPORT.get(ruleId) ?? false;

                    return (
                      <div
                        key={ruleId}
                        className={clsx(
                          "flex items-center gap-2 px-3 py-2",
                          aiDisabled && "opacity-50",
                        )}
                        title={aiDisabled ? "AI機能を有効にしてください" : undefined}
                      >
                        {/* Rule name */}
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-foreground truncate block">
                            {meta.nameJa}
                          </span>
                        </div>

                        {/* Skip dialogue toggle */}
                        {showDialogueToggle && (
                          <button
                            disabled={aiDisabled}
                            onClick={() =>
                              onLintingRuleConfigChange(ruleId, {
                                ...config,
                                skipDialogue: !config.skipDialogue,
                              })
                            }
                            className={clsx(
                              "p-1 rounded transition-colors flex-shrink-0",
                              config.skipDialogue
                                ? "text-accent hover:text-accent-hover"
                                : "text-foreground-muted hover:text-foreground-secondary",
                            )}
                            title={config.skipDialogue ? "対話文を無視中" : "対話文も検査中"}
                          >
                            {config.skipDialogue ? (
                              <MessageSquareOff className="w-3.5 h-3.5" />
                            ) : (
                              <MessageSquare className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        {/* Severity dropdown */}
                        <select
                          value={config.severity}
                          disabled={aiDisabled}
                          onChange={(e) =>
                            onLintingRuleConfigChange(ruleId, {
                              ...config,
                              severity: e.target.value as Severity,
                            })
                          }
                          className="text-xs px-1.5 py-0.5 border border-border-secondary rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-accent w-16"
                        >
                          <option value="error">エラー</option>
                          <option value="warning">警告</option>
                          <option value="info">情報</option>
                        </select>

                        {/* Toggle */}
                        <button
                          disabled={aiDisabled}
                          onClick={() =>
                            onLintingRuleConfigChange(ruleId, {
                              ...config,
                              enabled: !config.enabled,
                            })
                          }
                          className={clsx(
                            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0",
                            config.enabled ? "bg-accent" : "bg-foreground-muted"
                          )}
                        >
                          <span
                            className={clsx(
                              "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm",
                              config.enabled ? "translate-x-5" : "translate-x-0.5"
                            )}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
