"use client";

import type React from "react";
import { useMemo } from "react";
import clsx from "clsx";

import type { Severity } from "@/lib/linting/types";
import type { CorrectionConfig } from "@/lib/linting/correction-config";
import type { ModeRuleMetaInput } from "@/lib/linting/mode-rule-configs";
import { isElectronRenderer } from "@/lib/utils/runtime-env";
import { useIgnoredCorrectionsContext } from "@/contexts/IgnoredCorrectionsContext";

import ModeSelector from "./linting/ModeSelector";
import RulesetList from "./linting/RulesetList";
import MarketplaceEntryCard from "./linting/MarketplaceEntryCard";
import RulesetAutoUpdateToggle from "./linting/RulesetAutoUpdateToggle";
import ClearIgnoredCorrectionsButton from "./linting/ClearIgnoredCorrectionsButton";
import { useRulesetStatus } from "./linting/useRulesetStatus";

export interface LintingSettingsProps {
  lintingEnabled: boolean;
  onLintingEnabledChange: (value: boolean) => void;
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
  characterExtractionBatchSize?: number;
  onCharacterExtractionBatchSizeChange?: (value: number) => void;
  characterExtractionConcurrency?: number;
  onCharacterExtractionConcurrencyChange?: (value: number) => void;
  /** Optional correction config for mode selector and guideline priority UI. */
  correctionConfig?: CorrectionConfig;
  onCorrectionConfigChange?: (config: Partial<CorrectionConfig>) => void;
}

function LintingSettingsInner({
  lintingEnabled,
  onLintingEnabledChange,
  lintingRuleConfigs,
  onLintingRuleConfigChange,
  onLintingRuleConfigsBatchChange,
  characterExtractionBatchSize,
  onCharacterExtractionBatchSizeChange,
  characterExtractionConcurrency,
  onCharacterExtractionConcurrencyChange,
  correctionConfig,
  onCorrectionConfigChange,
}: LintingSettingsProps): React.ReactElement {
  const isElectron = isElectronRenderer();
  const rulesetStatus = useRulesetStatus();
  const ignoredCorrectionsCtx = useIgnoredCorrectionsContext();

  const showCorrectionConfig = Boolean(correctionConfig && onCorrectionConfigChange);

  // Flatten every loaded rule's metadata so the mode selector can derive
  // enabled/disabled from each rule's applicableModes (#1809/#1810 regression).
  const loadedRules = useMemo<ModeRuleMetaInput[]>(
    () =>
      rulesetStatus.rulesets.flatMap((ruleset) =>
        ruleset.rules.map((rule) => ({
          ruleId: rule.ruleId,
          applicableModes: rule.applicableModes,
          defaultConfig: rule.defaultConfig,
        })),
      ),
    [rulesetStatus.rulesets],
  );

  return (
    <div className="space-y-6">
      {/* ① Master toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">校正機能を有効にする</h3>
          <p className="text-xs text-foreground-tertiary mt-0.5">文章の校正ルールを適用します</p>
        </div>
        <button
          onClick={() => onLintingEnabledChange(!lintingEnabled)}
          className={clsx(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
            lintingEnabled ? "bg-accent" : "bg-foreground-muted",
          )}
          aria-label={lintingEnabled ? "校正を無効にする" : "校正を有効にする"}
        >
          <span
            className={clsx(
              "inline-block h-4 w-4 transform rounded-full transition-transform shadow-sm",
              lintingEnabled ? "translate-x-6 bg-accent-foreground" : "translate-x-1 bg-white",
            )}
          />
        </button>
      </div>

      {/* ② Correction mode selector + collapsible guideline list */}
      {showCorrectionConfig && correctionConfig && onCorrectionConfigChange && (
        <div
          className={clsx(
            "pt-4 border-t border-border transition-opacity",
            !lintingEnabled && "opacity-50 pointer-events-none",
          )}
        >
          <ModeSelector
            correctionConfig={correctionConfig}
            disabled={!lintingEnabled}
            loadedRules={loadedRules}
            onCorrectionConfigChange={onCorrectionConfigChange}
            onLintingRuleConfigsBatchChange={onLintingRuleConfigsBatchChange}
          />
        </div>
      )}

      {/* ③ Ruleset list */}
      <div
        className={clsx(
          "pt-4 border-t border-border transition-opacity",
          !lintingEnabled && "opacity-50 pointer-events-none",
        )}
      >
        <RulesetList
          lintingRuleConfigs={lintingRuleConfigs}
          onLintingRuleConfigChange={onLintingRuleConfigChange}
          onLintingRuleConfigsBatchChange={onLintingRuleConfigsBatchChange}
          disabled={!lintingEnabled}
          rulesetStatus={isElectron ? rulesetStatus : undefined}
        />

        {/* ルールセット自動更新トグル（Electron のみ） */}
        {isElectron && (
          <div className="mt-4 pt-4 border-t border-border">
            <RulesetAutoUpdateToggle disabled={!lintingEnabled} />
          </div>
        )}

        {/* Web fallback note */}
        {!isElectron && (
          <p className="text-xs text-foreground-tertiary mt-3">
            校正ルールはデスクトップ版で利用できます（Web 版にはルールセットが含まれていません）
          </p>
        )}
      </div>

      {/* ④ Marketplace entry card (Electron only) */}
      {isElectron && (
        <div className={clsx(!lintingEnabled && "opacity-50 pointer-events-none")}>
          <MarketplaceEntryCard />
        </div>
      )}

      {/* ⑤ Ignored corrections management */}
      {ignoredCorrectionsCtx && (
        <div className="pt-4 border-t border-border space-y-2.5">
          <div>
            <h3 className="text-sm font-medium text-foreground">無視した校正の管理</h3>
            <p className="text-xs text-foreground-tertiary mt-0.5">
              「無視」に設定したすべての校正指摘を再び表示します
            </p>
          </div>
          <ClearIgnoredCorrectionsButton />
        </div>
      )}

      {/* ⑥ Advanced settings (character extraction) */}
      {(onCharacterExtractionBatchSizeChange || onCharacterExtractionConcurrencyChange) && (
        <details className="pt-4 border-t border-border">
          <summary className="text-xs text-foreground-secondary cursor-pointer hover:text-foreground select-none">
            詳細設定
          </summary>
          <div className="mt-3 space-y-3">
            {onCharacterExtractionBatchSizeChange && characterExtractionBatchSize !== undefined && (
              <div className="flex items-center gap-3">
                <label
                  htmlFor="char-extraction-batch"
                  className="text-xs text-foreground-secondary flex-1"
                >
                  登場人物抽出バッチサイズ
                </label>
                <input
                  id="char-extraction-batch"
                  type="number"
                  min={1}
                  max={50}
                  value={characterExtractionBatchSize}
                  onChange={(e) => onCharacterExtractionBatchSizeChange(Number(e.target.value))}
                  className="w-16 text-xs px-1.5 py-0.5 border border-border-secondary rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            )}
            {onCharacterExtractionConcurrencyChange &&
              characterExtractionConcurrency !== undefined && (
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="char-extraction-concurrency"
                    className="text-xs text-foreground-secondary flex-1"
                  >
                    並列処理数
                  </label>
                  <input
                    id="char-extraction-concurrency"
                    type="number"
                    min={1}
                    max={8}
                    value={characterExtractionConcurrency}
                    onChange={(e) => onCharacterExtractionConcurrencyChange(Number(e.target.value))}
                    className="w-16 text-xs px-1.5 py-0.5 border border-border-secondary rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              )}
          </div>
        </details>
      )}
    </div>
  );
}

export default function LintingSettings(props: LintingSettingsProps): React.ReactElement {
  return <LintingSettingsInner {...props} />;
}
