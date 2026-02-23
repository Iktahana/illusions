export type {
  CorrectionEngine,
  Severity,
  LintIssue,
  LintRule,
  LintRuleConfig,
  LintReference,
  DocumentLintRule,
  MorphologicalLintRule,
  MorphologicalDocumentLintRule,
} from "./types";
export {
  isDocumentLintRule,
  isMorphologicalLintRule,
  isMorphologicalDocumentLintRule,
} from "./types";
export {
  AbstractLintRule,
  AbstractDocumentLintRule,
  AbstractMorphologicalLintRule,
  AbstractMorphologicalDocumentLintRule,
} from "./base-rule";
export { RuleRunner } from "./rule-runner";
export type { LlmState, LlmControllerOptions } from "./llm-controller";
export { LlmController } from "./llm-controller";

export type {
  ConfigChangeReason,
  CorrectionModeId,
  GuidelineId,
  CorrectionConfig,
} from "./correction-config";
export { DEFAULT_CORRECTION_CONFIG } from "./correction-config";

export type { Guideline, GuidelineLicense } from "./guidelines";
export { GUIDELINES, getGuideline } from "./guidelines";
export type { CorrectionMode } from "./correction-modes";
export {
  CORRECTION_MODES,
  getCorrectionMode,
  CORRECTION_MODE_IDS,
} from "./correction-modes";
export { getPresetForMode } from "./lint-presets";

// Phase D exports — unified CorrectionRule interface
export type {
  AnalysisContext,
  CorrectionCandidate,
  CorrectionRule,
} from "./types";
export { issueToCandidate, candidateToIssue } from "./types";
export { AbstractCorrectionRule } from "./base-rule";
export { CorrectionRuleRunner } from "./rule-runner";
export { LlmValidator } from "./llm-validator";
export { RULE_GUIDELINE_MAP } from "./lint-presets";
