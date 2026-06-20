"use client";

import type React from "react";
import { useCallback } from "react";
import clsx from "clsx";

import type { CorrectionConfig } from "@/lib/linting/correction-config";
import type { CorrectionModeId } from "@/lib/linting/correction-config";
import { CORRECTION_MODE_IDS, CORRECTION_MODES } from "@/lib/linting/correction-modes";
import {
  buildModeRuleConfigsFromRules,
  type ModeRuleMetaInput,
} from "@/lib/linting/mode-rule-configs";
import type { Severity } from "@/lib/linting/types";

interface ModeSelectorProps {
  correctionConfig: CorrectionConfig;
  disabled?: boolean;
  /**
   * Metadata of every currently-loaded rule (flattened across all rulesets).
   * Mode switching derives the enabled/disabled config from each rule's
   * `applicableModes`, so this MUST reflect the live ruleset state — passing an
   * empty/stale list silently makes the mode pills no-ops (the #1809/#1810
   * regression this prop exists to fix).
   */
  loadedRules: readonly ModeRuleMetaInput[];
  onCorrectionConfigChange: (config: Partial<CorrectionConfig>) => void;
  onLintingRuleConfigsBatchChange: (
    configs: Record<string, { enabled: boolean; severity: Severity; skipDialogue?: boolean }>,
  ) => void;
}

export default function ModeSelector({
  correctionConfig,
  disabled,
  loadedRules,
  onCorrectionConfigChange,
  onLintingRuleConfigsBatchChange,
}: ModeSelectorProps): React.ReactElement {
  const handleModeChange = useCallback(
    (modeId: string) => {
      const mode = CORRECTION_MODES[modeId as CorrectionModeId];
      if (!mode) return;
      onCorrectionConfigChange({
        mode: mode.id,
        guidelines: [...mode.defaultGuidelines],
      });
      // Build a complete config map (every loaded rule) from the rules'
      // applicableModes so the batch handler's replace semantics is correct:
      // rules opting into this mode are enabled, all others disabled.
      const configs = buildModeRuleConfigsFromRules(mode.id, loadedRules);
      onLintingRuleConfigsBatchChange(configs);
    },
    [loadedRules, onCorrectionConfigChange, onLintingRuleConfigsBatchChange],
  );

  return (
    <div
      className={clsx("space-y-3 transition-opacity", disabled && "opacity-50 pointer-events-none")}
    >
      {/* Mode pill row */}
      <div>
        <h4 className="text-sm font-medium text-foreground mb-2">校正モード</h4>
        <div className="flex flex-wrap gap-2">
          {CORRECTION_MODE_IDS.map((modeId) => {
            const mode = CORRECTION_MODES[modeId];
            const isActive = correctionConfig.mode === modeId;
            return (
              <button
                key={modeId}
                onClick={() => handleModeChange(modeId)}
                className={clsx(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                  isActive
                    ? "bg-accent text-accent-foreground border-accent"
                    : "bg-background text-foreground-secondary border-border hover:border-accent/50 hover:text-foreground",
                )}
                title={mode.descriptionJa}
              >
                {mode.nameJa}
              </button>
            );
          })}
        </div>
        {correctionConfig.mode && (
          <p className="text-xs text-foreground-tertiary mt-1.5">
            {CORRECTION_MODES[correctionConfig.mode].descriptionJa}
          </p>
        )}
      </div>
    </div>
  );
}
