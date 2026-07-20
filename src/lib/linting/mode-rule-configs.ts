/**
 * Mode → rule-config derivation from runtime ruleset metadata.
 *
 * Background (#1809/#1810 regression): the built-in rule tables were zeroed out
 * when every rule moved to external rulesets, so the legacy `LINT_PRESETS` /
 * `buildModeRuleConfigs(modeId)` path (which iterates the now-empty
 * `LINT_RULES_META`) can no longer enable/disable anything on a mode switch.
 *
 * The only runtime source of truth for "which rules are loaded and which modes
 * they opt into" is each loaded ruleset's per-rule metadata (`applicableModes`,
 * `defaultConfig`). This module derives a complete, mode-specific config map
 * from that metadata so switching modes actually toggles rules at runtime.
 *
 * Strict membership: a rule's `enabled` is decided solely by whether the
 * selected mode is in its `applicableModes`. The severity comes from the rule's
 * `defaultConfig` (falling back to "warning"). The returned map covers EVERY
 * known rule, so the batch handler can safely replace the whole config object
 * without dropping rules that belong to the new mode.
 */
import type { Severity } from "./types";
import type { CorrectionModeId } from "./correction-config";

/** Per-rule config shape applied on mode switch. */
export interface ModeRuleConfig {
  enabled: boolean;
  severity: Severity;
  skipDialogue?: boolean;
  /** Rule-specific options: manifest defaults overlaid with user overrides. */
  options?: Record<string, unknown>;
}

/**
 * Minimal rule metadata needed to derive a mode config. A structural subset of
 * both the SDK `RulesetRuleMeta` and the renderer's `useRulesetStatus`
 * `RulesetRuleMeta`, so either can be passed without adaptation.
 */
export interface ModeRuleMetaInput {
  ruleId: string;
  /** Modes this rule opts into. Missing/empty = never auto-enabled by a mode. */
  applicableModes?: readonly string[];
  defaultConfig?: {
    enabled?: boolean;
    severity?: string;
    skipDialogue?: boolean;
    options?: Record<string, unknown>;
  };
  /** Declares that the rule's issues can be resolved by adding the word to the user dictionary. */
  suggestsDictionaryEntry?: boolean;
}

const VALID_SEVERITIES = new Set<Severity>(["error", "warning", "info"]);

function normalizeSeverity(value: string | undefined): Severity {
  return value !== undefined && VALID_SEVERITIES.has(value as Severity)
    ? (value as Severity)
    : "warning";
}

/**
 * Build the effective per-rule config map for a correction mode from the
 * currently-loaded rule metadata.
 *
 * - `enabled = applicableModes.includes(modeId)` (strict membership)
 * - `severity = defaultConfig.severity ?? "warning"`
 * - `skipDialogue` is carried over from `defaultConfig` when present
 * - `options = { ...defaultConfig.options, ...prevConfigs[ruleId].options }` —
 *   rule options have no per-mode semantics, so user overrides (e.g.
 *   genji-out-of-dict's `includeVerbsAdjectives`, #2048) must survive the
 *   whole-map replace a mode switch performs, layered over manifest defaults.
 *
 * The result intentionally covers every rule in `rules` so callers may replace
 * the whole `lintingRuleConfigs` object. Duplicate ruleIds keep the first entry.
 *
 * @param modeId Selected correction mode.
 * @param rules Flattened metadata of every loaded rule (across all rulesets).
 * @param prevConfigs Current per-rule configs; only user `options` are carried over.
 * @returns ruleId → config map covering every supplied rule.
 */
export function buildModeRuleConfigsFromRules(
  modeId: CorrectionModeId,
  rules: readonly ModeRuleMetaInput[],
  prevConfigs?: Record<string, { options?: Record<string, unknown> }>,
): Record<string, ModeRuleConfig> {
  const out: Record<string, ModeRuleConfig> = {};
  for (const rule of rules) {
    if (!rule.ruleId || Object.prototype.hasOwnProperty.call(out, rule.ruleId)) continue;
    const modes = rule.applicableModes ?? [];
    const config: ModeRuleConfig = {
      enabled: modes.includes(modeId),
      severity: normalizeSeverity(rule.defaultConfig?.severity),
    };
    if (rule.defaultConfig?.skipDialogue !== undefined) {
      config.skipDialogue = rule.defaultConfig.skipDialogue;
    }
    const defaultOptions = rule.defaultConfig?.options;
    const userOptions = prevConfigs?.[rule.ruleId]?.options;
    if (defaultOptions !== undefined || userOptions !== undefined) {
      config.options = { ...defaultOptions, ...userOptions };
    }
    out[rule.ruleId] = config;
  }
  return out;
}
