/**
 * Ruleset SDK — module contract types.
 *
 * A "ruleset" is a code module that bundles a set of proofreading (lint) rules.
 * It is the unit of distribution: built-in rulesets ship inside illusions, and
 * external rulesets live under `~/.illusions/rulesets/<id>/` (Electron only).
 *
 * The manifest is plain data that can be read WITHOUT executing the module's
 * code (used for UI listing, engineApi checks, and quarantine decisions). The
 * `createRules(ctx)` factory is the only part that runs code.
 *
 * External ruleset repositories should depend on `@/lib/linting/sdk` with
 * `import type` ONLY — the runtime base classes and helpers are received through
 * the {@link RulesetContext} passed to `createRules`, never imported directly
 * (an un-bundled external module cannot resolve those imports at runtime).
 */
import type { CorrectionModeId } from "../correction-config";
import type { LintRule, LintRuleConfig, RuleLevel } from "../types";
import type { RulesetContext } from "./ruleset-context";

/** Current engine API major version. Rulesets declaring a different value are quarantined. */
export const ENGINE_API_VERSION = 1;

/**
 * Correction mode (校正モード) identifier. Re-exported as part of the SDK
 * contract so external rulesets can target it without importing illusions
 * internals (the template vendors an identical standalone copy).
 */
export type { CorrectionModeId };

/**
 * Canonical, ordered list of all correction modes a rule may opt into via
 * {@link RulesetRuleMeta.applicableModes}. Used by manifest validation.
 */
export const CORRECTION_MODE_IDS: readonly CorrectionModeId[] = [
  "novel",
  "official",
  "blog",
  "academic",
  "sns",
];

/**
 * An external capability a ruleset (or a single rule) depends on.
 * Unsatisfied requirements cause the affected rules to be disabled with a
 * Japanese warning rather than failing hard.
 */
export type RulesetRequirement = { kind: "dict"; dictId: "genji" };

/** Stable string label for a requirement, e.g. "dict:genji". */
export function requirementKey(req: RulesetRequirement): string {
  return `${req.kind}:${req.dictId}`;
}

/** SPDX-ish license label reused for guideline catalog display. */
export type GuidelineLicenseLabel = "Public" | "Paid" | "CC BY 4.0";

/** Guideline (出典・規約) metadata contributed by a ruleset. */
export interface RulesetGuidelineMeta {
  /** Stable id, kept compatible with legacy GuidelineId values where applicable. */
  id: string;
  nameJa: string;
  publisherJa: string;
  /** Publication year, or null when not applicable. */
  year: number | null;
  license: GuidelineLicenseLabel;
  descriptionJa: string;
}

/** The 校正目録 entry for a rule: examples + source citation. Doubles as golden-test input. */
export interface RulesetRuleDocs {
  /** A correct sentence: linting it must yield 0 issues for this rule. */
  positiveExample: string;
  /** An incorrect sentence: linting it must yield >= 1 issue for this rule. */
  negativeExample: string;
  /** Human-readable source reference (standard name + section). */
  sourceReference: string;
}

/** Per-rule metadata, readable without executing code. */
export interface RulesetRuleMeta {
  /** Stable rule id; kept identical to legacy ids (e.g. "jtf-4-3-7") for compatibility. */
  ruleId: string;
  nameJa: string;
  descriptionJa: string;
  /** Guideline this rule belongs to. Undefined = universal (always allowed). */
  guidelineId?: string;
  level: RuleLevel;
  defaultConfig: LintRuleConfig;
  /** Whether this rule honors the skipDialogue option. */
  supportsSkipDialogue?: boolean;
  /**
   * Declares that issues from this rule can be resolved by adding the flagged
   * word to the user dictionary. Pure data (no UI): the host renders an
   * "add to dictionary" action and owns the write. Used by dictionary-membership
   * rules such as `genji-out-of-dict`. Default (absent) = no such action.
   */
  suggestsDictionaryEntry?: boolean;
  /**
   * Correction modes (校正モード) this rule opts into. When the user switches to
   * one of these modes, the rule is automatically enabled. An empty array means
   * the rule is never auto-enabled by any mode (manual toggle only).
   */
  applicableModes: CorrectionModeId[];
  docs: RulesetRuleDocs;
  /** Requirements specific to this rule (subset of manifest.requires). */
  requires?: RulesetRequirement[];
}

/** Plain-data manifest. MUST be serializable and readable without running code. */
export interface RulesetManifest {
  /** Globally unique id. Built-in ids use the reserved `builtin.` namespace. */
  id: string;
  name: string;
  nameJa: string;
  /** Semantic version of the ruleset itself. */
  version: string;
  /** Engine API version this ruleset targets. Must equal {@link ENGINE_API_VERSION}. */
  engineApi: number;
  /**
   * License / copyright-policy name for the ruleset's CONTENTS, e.g. "MIT",
   * "CC BY 4.0", or for rulesets derived from commercial books a label like
   * "書籍（要購入）". The rule CODE is original; this names the policy under
   * which the orthographic conventions (and any examples) are distributed.
   */
  license: string;
  /** Optional link to the full license text / deed. */
  licenseUrl?: string;
  /**
   * Optional purchase / where-to-obtain link. Set for rulesets distilled from
   * commercial physical books: the conventions are facts free to reuse, but
   * the source book itself must be bought. The app surfaces this as a
   * 「購入へ」link beside the ruleset name.
   */
  purchaseUrl?: string;
  /**
   * Maintainer contact email. REQUIRED. The marketplace sends listing and
   * ruleset-related notifications to this address. Must be a valid email.
   */
  maintainerEmail: string;
  /**
   * Common naming prefix shared by every `ruleId` in this ruleset
   * (e.g. "rule_ME2_", "nihongo_hyouki_", "myteam-"). Used to namespace rules
   * and avoid cross-ruleset collisions in the marketplace. When set, the
   * registry warns about any rule whose id does not start with it.
   */
  rulesetPrefix?: string;
  guidelines: RulesetGuidelineMeta[];
  rules: RulesetRuleMeta[];
  /** Ruleset-wide requirements. */
  requires?: RulesetRequirement[];
}

/** The object a ruleset module returns as its default export. */
export interface RulesetModule {
  manifest: RulesetManifest;
  /** Build concrete lint rules using the SDK tools provided in `ctx`. */
  createRules(ctx: RulesetContext): LintRule[];
}
