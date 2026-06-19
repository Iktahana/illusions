"use client";

import type React from "react";
import { MessageSquare, MessageSquareOff } from "lucide-react";
import clsx from "clsx";

import type { RuleLevel, Severity } from "@/lib/linting/types";

const RULE_LEVEL_LABELS: Record<RuleLevel, string> = {
  L1: "L1：正規表現による検出",
  L2: "L2：形態素解析による検出",
  L3: "L3：LLM 補助による検出",
};

export interface RuleConfig {
  enabled: boolean;
  severity: Severity;
  skipDialogue?: boolean;
}

export interface RuleRowProps {
  ruleId: string;
  nameJa: string;
  level?: RuleLevel;
  supportsSkipDialogue?: boolean;
  config: RuleConfig;
  disabled?: boolean;
  onChange: (ruleId: string, config: RuleConfig) => void;
}

export default function RuleRow({
  ruleId,
  nameJa,
  level,
  supportsSkipDialogue,
  config,
  disabled,
  onChange,
}: RuleRowProps): React.ReactElement {
  return (
    <div
      className={clsx(
        "flex items-center gap-2 px-3 py-2 transition-opacity",
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      {/* Rule name + level tag */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        {level && (
          <span
            className="flex-shrink-0 text-[10px] font-medium leading-none px-1 py-0.5 rounded border border-border-secondary text-foreground-tertiary bg-background-tertiary/50"
            title={RULE_LEVEL_LABELS[level]}
          >
            {level}
          </span>
        )}
        <span className="text-sm text-foreground truncate">{nameJa}</span>
      </div>

      {/* Skip dialogue toggle */}
      {supportsSkipDialogue && (
        <button
          onClick={() => onChange(ruleId, { ...config, skipDialogue: !config.skipDialogue })}
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
        onChange={(e) => onChange(ruleId, { ...config, severity: e.target.value as Severity })}
        className="text-xs px-1.5 py-0.5 border border-border-secondary rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-accent w-16"
      >
        <option value="error">エラー</option>
        <option value="warning">警告</option>
        <option value="info">情報</option>
      </select>

      {/* Enable toggle */}
      <button
        onClick={() => onChange(ruleId, { ...config, enabled: !config.enabled })}
        className={clsx(
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0",
          config.enabled ? "bg-accent" : "bg-foreground-muted",
        )}
        aria-label={config.enabled ? "ルールを無効にする" : "ルールを有効にする"}
      >
        <span
          className={clsx(
            "inline-block h-3.5 w-3.5 transform rounded-full transition-transform shadow-sm",
            config.enabled ? "translate-x-5 bg-accent-foreground" : "translate-x-0.5 bg-white",
          )}
        />
      </button>
    </div>
  );
}
