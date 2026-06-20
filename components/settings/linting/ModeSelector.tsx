"use client";

import type React from "react";
import { useCallback } from "react";
import clsx from "clsx";

import type { CorrectionConfig } from "@/lib/linting/correction-config";
import type { CorrectionModeId } from "@/lib/linting/correction-config";
import {
  CORRECTION_MODE_IDS,
  CORRECTION_MODES,
  MODE_TO_PRESET,
} from "@/lib/linting/correction-modes";
import { LINT_PRESETS } from "@/lib/linting/lint-presets";
import type { Severity } from "@/lib/linting/types";

interface ModeSelectorProps {
  correctionConfig: CorrectionConfig;
  disabled?: boolean;
  onCorrectionConfigChange: (config: Partial<CorrectionConfig>) => void;
  onLintingRuleConfigsBatchChange: (
    configs: Record<string, { enabled: boolean; severity: Severity; skipDialogue?: boolean }>,
  ) => void;
}

export default function ModeSelector({
  correctionConfig,
  disabled,
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
      const presetId = MODE_TO_PRESET[modeId as CorrectionModeId];
      const preset = presetId ? LINT_PRESETS[presetId] : undefined;
      if (preset) {
        onLintingRuleConfigsBatchChange({ ...preset.configs });
      }
    },
    [onCorrectionConfigChange, onLintingRuleConfigsBatchChange],
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
