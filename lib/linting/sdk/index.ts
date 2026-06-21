/**
 * Ruleset SDK — public surface for ruleset authors.
 *
 * A ruleset repository depends on THIS module only. Types may be imported
 * freely (`import type { … } from "@/lib/linting/sdk"`); runtime base classes
 * and detectors must be obtained from the `RulesetContext` passed to
 * `createRules`, because an un-bundled external module cannot resolve value
 * imports against illusions internals at runtime.
 *
 * @see docs/ruleset/authoring.md
 */

// Engine version + module contract
export { ENGINE_API_VERSION, requirementKey, CORRECTION_MODE_IDS } from "./ruleset-types";
export type {
  RulesetModule,
  RulesetManifest,
  RulesetRuleMeta,
  RulesetRuleDocs,
  RulesetGuidelineMeta,
  RulesetRequirement,
  GuidelineLicenseLabel,
  CorrectionModeId,
} from "./ruleset-types";

// Context handed to createRules()
export type {
  RulesetContext,
  RulesetBases,
  RulesetDeps,
  DetectorToolkit,
  DictToolkit,
  RegexReplaceOptions,
  UnitDetectorOptions,
  UnitSpec,
  WordListMatch,
} from "./ruleset-context";

// Core lint types ruleset code interacts with
export type {
  LintRule,
  LintIssue,
  LintRuleConfig,
  LintReference,
  Severity,
  RuleLevel,
  JsonRuleMeta,
  DocumentLintRule,
  MorphologicalLintRule,
  MorphologicalDocumentLintRule,
} from "../types";
export {
  isDocumentLintRule,
  isMorphologicalLintRule,
  isMorphologicalDocumentLintRule,
} from "../types";

/**
 * Base classes — exported for BUILT-IN rulesets (bundled with illusions) and for
 * `import type` use by external rulesets. External rulesets must extend the
 * classes received via `ctx.bases`, not these direct exports.
 */
export {
  AbstractLintRule,
  AbstractL1Rule,
  AbstractDocumentLintRule,
  AbstractMorphologicalLintRule,
  AbstractMorphologicalDocumentLintRule,
} from "../base-rule";
