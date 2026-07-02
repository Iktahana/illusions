"use client";

import type React from "react";
import { useCallback, useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import clsx from "clsx";

import type { Severity } from "@/lib/linting/types";
import {
  LINT_RULE_CATEGORIES,
  LINT_RULES_META,
  LINT_DEFAULT_CONFIGS,
} from "@/lib/linting/lint-presets";

import RulesetCard from "./RulesetCard";
import type { RulesetCardRule } from "./RulesetCard";
import type { UseRulesetStatusReturn } from "./useRulesetStatus";
import { buildBulkConfig, collectAllRuleIds } from "./bulk-toggle";

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

  // 表示中の全ルール ID（内蔵 LINT_RULES_META + 外部ルールセット）を収集する。
  // 内蔵ルールゼロ化後はルールが外部ルールセット (rulesetStatus.rulesets) から
  // 供給されるため、LINT_RULES_META だけを回すと一括操作が空振りする (#1832)。
  const allRuleIds = useCallback(
    (): string[] =>
      collectAllRuleIds(
        LINT_RULES_META.map((rule) => rule.id),
        rulesetStatus?.rulesets,
      ),
    [rulesetStatus],
  );

  const handleEnableAll = useCallback(() => {
    onLintingRuleConfigsBatchChange(
      buildBulkConfig(lintingRuleConfigs, allRuleIds(), true, getConfig),
    );
  }, [lintingRuleConfigs, onLintingRuleConfigsBatchChange, allRuleIds]);

  const handleDisableAll = useCallback(() => {
    onLintingRuleConfigsBatchChange(
      buildBulkConfig(lintingRuleConfigs, allRuleIds(), false, getConfig),
    );
  }, [lintingRuleConfigs, onLintingRuleConfigsBatchChange, allRuleIds]);

  const handleResetDefaults = useCallback(() => {
    onLintingRuleConfigsBatchChange({ ...LINT_DEFAULT_CONFIGS });
  }, [onLintingRuleConfigsBatchChange]);

  // 一括更新（Electron のみ）。更新ありの公式ルールセットを sync() でまとめて
  // ダウンロードする。syncAllOfficial は差分のみ落とすため最新は触らない。
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const updatableCount = rulesetStatus?.rulesets.filter((r) => r.updateAvailable).length ?? 0;
  const anySyncing = bulkUpdating || (rulesetStatus?.rulesets.some((r) => r.syncing) ?? false);
  const handleUpdateAll = useCallback(async () => {
    if (!rulesetStatus) return;
    setBulkUpdating(true);
    try {
      await rulesetStatus.sync();
    } finally {
      setBulkUpdating(false);
    }
  }, [rulesetStatus]);

  // Build legacy pack rules (内蔵)
  const ruleMetaMap = new Map(LINT_RULES_META.map((r) => [r.id, r]));

  const legacyPacks = LINT_RULE_CATEGORIES.map((cat) => ({
    id: cat.id,
    nameJa: cat.nameJa,
    publisherJa: cat.publisherJa,
    license: cat.license,
    licenseUrl: cat.licenseUrl,
    purchaseUrl: cat.purchaseUrl,
    rules: cat.rules
      .map((ruleId) => ruleMetaMap.get(ruleId))
      .filter((meta): meta is (typeof LINT_RULES_META)[number] => meta != null)
      .map((meta): RulesetCardRule => ({
        ruleId: meta.id,
        nameJa: meta.nameJa,
        supportsSkipDialogue: meta.supportsSkipDialogue,
      })),
  }));

  return (
    <div className="space-y-4">
      {/* Section heading + bulk actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-medium text-foreground flex-1">校正ルールセット</h3>
        {/* 一括更新ボタン（Electron かつ更新ありが 1 件以上のときのみ表示） */}
        {rulesetStatus && updatableCount > 0 && (
          <button
            onClick={() => void handleUpdateAll()}
            disabled={anySyncing}
            className={clsx(
              "flex items-center gap-1 text-xs px-2 py-1 rounded font-medium transition-colors",
              "bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {anySyncing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            すべて更新（{updatableCount}）
          </button>
        )}
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
          publisherJa={pack.publisherJa}
          license={pack.license}
          licenseUrl={pack.licenseUrl}
          purchaseUrl={pack.purchaseUrl}
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
            publisherJa={rs.publisherJa ?? undefined}
            license={rs.license ?? undefined}
            licenseUrl={rs.licenseUrl ?? undefined}
            purchaseUrl={rs.purchaseUrl ?? undefined}
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
