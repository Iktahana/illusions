/**
 * Ruleset registry public exports (internal to illusions; not the author SDK).
 */
export { RulesetRegistry, validateManifest, BUILTIN_NAMESPACE } from "./ruleset-registry";
export type {
  LoadedRulesetEntry,
  RulesetWarning,
  RulesetWarningCode,
  RequirementGate,
} from "./ruleset-registry";

export { createRulesetContext, resolveRulesetContext } from "./ruleset-context-factory";
export type { BuildContextOptions } from "./ruleset-context-factory";

export type {
  RulesetSourceAdapter,
  RulesetSourceKind,
  RawRuleset,
  IllrulesetContainerHeader,
} from "./ruleset-source";
