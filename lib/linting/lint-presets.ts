import type { Severity } from "./types";
import type { CorrectionModeId, GuidelineId } from "./correction-config";

/** Static metadata for lint rules displayed in settings and inspector */
export interface LintRuleMeta {
  id: string;
  nameJa: string;
  descriptionJa: string;
  /** Whether this rule supports the skipDialogue toggle. False = toggle hidden in UI. */
  supportsSkipDialogue?: boolean;
  /** The guideline this rule belongs to. undefined = universal (always runs). */
  guidelineId?: GuidelineId;
  /**
   * Correction modes this rule belongs to. Switching to a listed mode enables
   * the rule; switching to a mode NOT listed disables it (strict membership).
   * An empty array means the rule is off in every mode (manual toggle only).
   */
  applicableModes: CorrectionModeId[];
}

// All built-in JTF rules have been migrated to an external ruleset repo.
// This array is intentionally empty; rules are loaded via the external ruleset loader.
export const LINT_RULES_META: LintRuleMeta[] = [];

/** Category grouping for rule display */
export interface LintRuleCategory {
  id: string;
  nameJa: string;
  /** Author / publisher (出典の著者・発行元), shown dimmed after the title. */
  publisherJa?: string;
  /** License / copyright-policy name shown beside the pack name. */
  license?: string;
  /** Optional link to the license text. */
  licenseUrl?: string;
  /** Optional purchase link for packs derived from commercial physical books. */
  purchaseUrl?: string;
  rules: string[];
}

// All built-in categories have been migrated to external ruleset repos.
export const LINT_RULE_CATEGORIES: LintRuleCategory[] = [];

/** Per-rule config shape used in presets and settings */
export interface LintRulePresetConfig {
  enabled: boolean;
  severity: Severity;
  skipDialogue?: boolean;
}

/** Default configs per rule -- used as standard mode */
export const LINT_DEFAULT_CONFIGS: Record<string, LintRulePresetConfig> = {};

/** Preset configuration for one-shot application */
export interface LintPreset {
  nameJa: string;
  configs: Record<string, LintRulePresetConfig>;
}

export const LINT_PRESETS: Record<string, LintPreset> = {
  relaxed: {
    nameJa: "寛容モード",
    configs: {},
  },
  standard: {
    nameJa: "標準モード",
    configs: { ...LINT_DEFAULT_CONFIGS },
  },
  strict: {
    nameJa: "厳密モード",
    configs: {},
  },
  novel: {
    nameJa: "小説モード",
    configs: {},
  },
};

// ---------------------------------------------------------------------------
// Mode-based preset generation
// ---------------------------------------------------------------------------

import { MODE_TO_PRESET } from "./correction-modes";

/**
 * Build the effective per-rule config map for a correction mode.
 *
 * Strict membership: a rule's `enabled` is decided solely by whether the mode
 * is in its `applicableModes` (see {@link LintRuleMeta.applicableModes}); its
 * severity comes from the mode's preset (or the default config as a fallback).
 * This is the single source applied on mode switch by every call site.
 *
 * With an empty LINT_RULES_META (all rules now come from external rulesets),
 * this function returns an empty object.
 */
export function buildModeRuleConfigs(
  modeId: CorrectionModeId,
): Record<string, LintRulePresetConfig> {
  const preset = LINT_PRESETS[MODE_TO_PRESET[modeId]];
  const base = preset ? preset.configs : LINT_DEFAULT_CONFIGS;

  const out: Record<string, LintRulePresetConfig> = {};
  for (const meta of LINT_RULES_META) {
    const baseCfg = base[meta.id] ??
      LINT_DEFAULT_CONFIGS[meta.id] ?? { enabled: false, severity: "info" as const };
    out[meta.id] = { ...baseCfg, enabled: meta.applicableModes.includes(modeId) };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Guideline map export
// ---------------------------------------------------------------------------

/**
 * Map from rule ID to its GuidelineId (or undefined for universal rules).
 * Used by RuleRunner for guideline-based filtering.
 */
export const RULE_GUIDELINE_MAP: Map<string, GuidelineId | undefined> = new Map(
  LINT_RULES_META.map((rule) => [rule.id, rule.guidelineId]),
);
