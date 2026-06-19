"use client";

import type React from "react";
import { useCallback } from "react";

import type { Severity } from "@/lib/linting/types";
import {
  LINT_RULE_CATEGORIES,
  LINT_RULES_META,
  LINT_DEFAULT_CONFIGS,
} from "@/lib/linting/lint-presets";

import RulesetCard from "./RulesetCard";
import type { RulesetCardRule } from "./RulesetCard";
import type { UseRulesetStatusReturn } from "./useRulesetStatus";

interface RulesetListProps {
  lintingRuleConfigs: Record<
    string,
    { enabled: boolean; severity: Severity; skipDialogue?: boolean }
  >;
  onLintingRuleConfigChange: (
    ruleId: string,
    config: { enabled: boolean; severity: Severity; skipDialogue?: boolean },
  ) => void;
  onLintingRuleConfigsBatchChange: (
    configs: Record<string, { enabled: boolean; severity: Severity; skipDialogue?: boolean }>,
  ) => void;
  disabled?: boolean;
  /** Undefined on Web (no-op; only Electron provides this) */
  rulesetStatus?: UseRulesetStatusReturn;
}

function getConfig(
  ruleId: string,
  configs: Record<string, { enabled: boolean; severity: Severity; skipDialogue?: boolean }>,
): { enabled: boolean; severity: Severity; skipDialogue?: boolean } {
  return configs[ruleId] ?? LINT_DEFAULT_CONFIGS[ruleId] ?? { enabled: true, severity: "warning" };
}

export default function RulesetList({
  lintingRuleConfigs,
  onLintingRuleConfigChange,
  onLintingRuleConfigsBatchChange,
  disabled,
  rulesetStatus,
}: RulesetListProps): React.ReactElement {
  /** Batch-toggle an array of rule IDs */
  const handlePackToggle = useCallback(
    (ruleIds: string[], enabled: boolean) => {
      const next = { ...lintingRuleConfigs };
      for (const ruleId of ruleIds) {
        const current = getConfig(ruleId, next);
        next[ruleId] = { ...current, enabled };
      }
      onLintingRuleConfigsBatchChange(next);
    },
    [lintingRuleConfigs, onLintingRuleConfigsBatchChange],
  );

  const handleEnableAll = useCallback(() => {
    const next: Record<string, { enabled: boolean; severity: Severity; skipDialogue?: boolean }> =
      {};
    for (const rule of LINT_RULES_META) {
      next[rule.id] = { ...getConfig(rule.id, lintingRuleConfigs), enabled: true };
    }
    onLintingRuleConfigsBatchChange(next);
  }, [lintingRuleConfigs, onLintingRuleConfigsBatchChange]);

  const handleDisableAll = useCallback(() => {
    const next: Record<string, { enabled: boolean; severity: Severity; skipDialogue?: boolean }> =
      {};
    for (const rule of LINT_RULES_META) {
      next[rule.id] = { ...getConfig(rule.id, lintingRuleConfigs), enabled: false };
    }
    onLintingRuleConfigsBatchChange(next);
  }, [lintingRuleConfigs, onLintingRuleConfigsBatchChange]);

  const handleResetDefaults = useCallback(() => {
    onLintingRuleConfigsBatchChange({ ...LINT_DEFAULT_CONFIGS });
  }, [onLintingRuleConfigsBatchChange]);

  // Build legacy pack rules (内蔵)
  const ruleMetaMap = new Map(LINT_RULES_META.map((r) => [r.id, r]));

  const legacyPacks = LINT_RULE_CATEGORIES.map((cat) => ({
    id: cat.id,
    nameJa: cat.nameJa,
    rules: cat.rules
      .map((ruleId) => ruleMetaMap.get(ruleId))
      .filter((meta): meta is (typeof LINT_RULES_META)[number] => meta != null)
      .map(
        (meta): RulesetCardRule => ({
          ruleId: meta.id,
          nameJa: meta.nameJa,
          supportsSkipDialogue: meta.supportsSkipDialogue,
        }),
      ),
  }));

  return (
    <div className="space-y-4">
      {/* Section heading + bulk actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-medium text-foreground flex-1">校正ルールセット</h3>
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
          既定に戻す
        </button>
      </div>

      {/* Legacy built-in packs */}
      {legacyPacks.map((pack) => (
        <RulesetCard
          key={pack.id}
          id={pack.id}
          nameJa={pack.nameJa}
          source="built-in"
          rules={pack.rules}
          ruleConfigs={lintingRuleConfigs}
          defaultConfigs={LINT_DEFAULT_CONFIGS}
          deletable={false}
          disabled={disabled}
          onRuleConfigChange={onLintingRuleConfigChange}
          onPackToggle={handlePackToggle}
        />
      ))}

      {/* Downloaded official packs (Electron only) */}
      {rulesetStatus &&
        rulesetStatus.rulesets.map((rs) => (
          <RulesetCard
            key={rs.id}
            id={rs.id}
            nameJa={rs.nameJa}
            source="official"
            version={rs.version}
            tag={rs.tag}
            rules={rs.rules.map((r) => ({
              ruleId: r.ruleId,
              nameJa: r.nameJa,
              level: r.level as RulesetCardRule["level"],
              supportsSkipDialogue: r.supportsSkipDialogue,
            }))}
            updateAvailable={rs.updateAvailable}
            syncing={rs.syncing}
            error={rs.error}
            deletable={false}
            ruleConfigs={lintingRuleConfigs}
            disabled={disabled}
            onRuleConfigChange={onLintingRuleConfigChange}
            onPackToggle={handlePackToggle}
            onCheckUpdate={() => rulesetStatus.refresh()}
            onRedownload={() => rulesetStatus.sync()}
          />
        ))}
    </div>
  );
}
