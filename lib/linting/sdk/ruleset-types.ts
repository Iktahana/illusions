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
import type { LintRule, LintRuleConfig, RuleLevel } from "../types";
import type { RulesetContext } from "./ruleset-context";

/** Current engine API major version. Rulesets declaring a different value are quarantined. */
export const ENGINE_API_VERSION = 1;

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
  license: string;
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
