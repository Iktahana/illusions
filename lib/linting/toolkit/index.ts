/**
 * Detector toolkit assembly.
 *
 * `createToolkit(dict)` binds the pure detector functions together with a
 * dictionary toolkit into the {@link DetectorToolkit} object passed to rulesets
 * via `ctx.toolkit`.
 */
import type { JsonRuleMeta } from "../types";
import type { DetectorToolkit, DictToolkit } from "../sdk/ruleset-context";
import type { RulesetManifest, RulesetRuleMeta } from "../sdk/ruleset-types";

import { nfkc } from "./nfkc";
import { applyCharMap, charMap } from "./char-map";
import { regexReplace } from "./regex-replace";
import { detectUnits } from "./unit-detector";
import { matchWordList } from "./word-list";
import { dedupe } from "./dedupe";
import { posFilter } from "./pos-filter";

export { nfkc, isNfkc } from "./nfkc";
export { charMap, applyCharMap } from "./char-map";
export { regexReplace, toGlobal } from "./regex-replace";
export { detectUnits } from "./unit-detector";
export { matchWordList, escapeRegExp } from "./word-list";
export { dedupe, defaultIssueKey } from "./dedupe";
export { posFilter, isPos } from "./pos-filter";
export { createDictToolkit, createSnapshotDictToolkit } from "./dict-toolkit";
export type { DictLike, DictToolkitInternal, DictSnapshotEntry } from "./dict-toolkit";

/** Build a legacy JsonRuleMeta from ruleset metadata (constructor boilerplate). */
export function toJsonRuleMeta(rule: RulesetRuleMeta, manifest: RulesetManifest): JsonRuleMeta {
  return {
    ruleId: rule.ruleId,
    level: rule.level,
    description: rule.descriptionJa,
    patternLogic: "", // code-driven; logic lives in the ruleset module
    positiveExample: rule.docs.positiveExample,
    negativeExample: rule.docs.negativeExample,
    sourceReference: rule.docs.sourceReference,
    bookTitle: manifest.nameJa,
  };
}

/** Assemble the detector toolkit bound to a dictionary toolkit. */
export function createToolkit(dict: DictToolkit): DetectorToolkit {
  return {
    nfkc,
    charMap,
    applyCharMap,
    regexReplace,
    detectUnits,
    matchWordList,
    dedupe,
    posFilter,
    toJsonRuleMeta,
    dict,
  };
}
