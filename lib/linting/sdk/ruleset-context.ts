/**
 * Ruleset SDK — the context handed to `createRules(ctx)`.
 *
 * Everything a ruleset needs at runtime arrives through this object:
 *  - `bases`   : the abstract rule base classes to `extends`.
 *  - `toolkit` : shared detectors (NFKC, regex-replace, unit dedup, …) so rules
 *                never re-implement the same logic. Tier A/B audit fixes live here.
 *  - `deps`    : resolved external dependency state (e.g. dictionary readiness).
 *
 * This indirection is what lets an un-bundled external module run without
 * resolving `import`s against illusions internals.
 */
import type { Token } from "@/lib/nlp-client/types";
import type { DictLookup } from "@/lib/dict/dict-types";
import type { GenjiHealthState } from "@/lib/dict/dict-access";
import type { DictCandidateOptions } from "@/lib/linting/dict-candidate-terms";

export type { DictCandidateOptions };

import type {
  AbstractDocumentLintRule,
  AbstractL1Rule,
  AbstractLintRule,
  AbstractMorphologicalDocumentLintRule,
  AbstractMorphologicalLintRule,
} from "../base-rule";
import type { JsonRuleMeta, LintIssue, LintReference, LintRuleConfig, Severity } from "../types";
import type { RulesetManifest, RulesetRuleMeta } from "./ruleset-types";

/** Abstract rule base-class constructors exposed to ruleset code. */
export interface RulesetBases {
  AbstractLintRule: typeof AbstractLintRule;
  AbstractL1Rule: typeof AbstractL1Rule;
  AbstractMorphologicalLintRule: typeof AbstractMorphologicalLintRule;
  AbstractDocumentLintRule: typeof AbstractDocumentLintRule;
  AbstractMorphologicalDocumentLintRule: typeof AbstractMorphologicalDocumentLintRule;
}

/** Options for {@link DetectorToolkit.regexReplace}. */
export interface RegexReplaceOptions {
  text: string;
  /** Pattern to scan with. Cloned with the global flag internally, so lastIndex is never shared. */
  pattern: RegExp;
  ruleId: string;
  severity: Severity;
  message: string;
  messageJa: string;
  /** Build the fix replacement string for a match. */
  replacement: (match: RegExpExecArray) => string;
  /**
   * Optional custom flagged span (relative to the whole text). Defaults to the
   * entire match. `original` must equal text.slice(from, to).
   */
  span?: (match: RegExpExecArray) => { from: number; to: number; original: string };
  reference?: LintReference;
  /** Fix label (English). Defaults to a generic label. */
  fixLabel?: string;
  /** Fix label (Japanese). Defaults to a generic label. */
  fixLabelJa?: string;
}

/** One incorrect→correct unit notation mapping. */
export interface UnitSpec {
  /** Regex matching the INCORRECT unit notation (typically with a digit lookbehind). */
  pattern: RegExp;
  /** Canonical correct notation. Matches already equal to this are skipped. */
  correct: string;
}

/** Options for {@link DetectorToolkit.detectUnits}. */
export interface UnitDetectorOptions {
  text: string;
  ruleId: string;
  severity: Severity;
  units: ReadonlyArray<UnitSpec>;
  reference?: LintReference;
  /** Override the default Japanese message. */
  messageJa?: (matched: string, correct: string) => string;
  /** Remove issues that share the same [from,to) span. Default true (Tier A fix). */
  dedup?: boolean;
}

/** A fixed-vocabulary match. */
export interface WordListMatch {
  word: string;
  from: number;
  to: number;
}

/** Dictionary access wrapper. Fails safe (empty results) when the dict is not ready. */
export interface DictToolkit {
  /** True only when the local dictionary DB is installed and healthy (Electron). */
  readonly ready: boolean;
  readonly state: GenjiHealthState;
  /** Exact-match batch lookup. Returns an empty Map when not ready. */
  lookupBatch(terms: string[]): Promise<Map<string, DictLookup>>;
  /** Whether a headword exists. Returns false when not ready. */
  has(term: string): Promise<boolean>;
  /**
   * Synchronous membership check against the current prewarmed snapshot.
   *
   * The lint pipeline is synchronous (`lint`/`lintWithTokens` return arrays, not
   * promises), but dictionary I/O is async. A rule that needs dictionary access
   * therefore declares the terms it will query via {@link DictPrewarmRule.collectDictTerms};
   * the pipeline batch-fetches them (`lookupBatch`) and installs a snapshot just
   * before the rule runs. `hasCached`/`lookupCached` read that snapshot.
   *
   * Returns `false`/`undefined` when the dictionary is not ready OR the term was
   * not prewarmed — so a rule that fails to declare a term simply gets no hit
   * (it never false-positives on a missing snapshot).
   */
  hasCached(term: string): boolean;
  /** Synchronous projection lookup against the current prewarmed snapshot. */
  lookupCached(term: string): DictLookup | undefined;
  /**
   * The dictionary headword a token should be looked up under, or `null` if the
   * token is not a checkable content word (名詞 → surface, 動詞/形容詞 → basic
   * form, falling back to surface).
   *
   * Host-owned so rulesets need NOT vendor a private copy of this selection.
   * The host prewarms snapshot membership with the exact same logic, so the key
   * a rule queries always matches a key that was prewarmed — eliminating the
   * "ruleset mirror drifts out of sync → snapshot miss" failure mode.
   */
  candidateTerm(token: Token, opts?: DictCandidateOptions): string | null;
  /**
   * Deduplicated list of dictionary headwords to query for a token set — the
   * same selection {@link candidateTerm} applies, used by the host at prewarm.
   */
  candidateTerms(tokens: ReadonlyArray<Token>, opts?: DictCandidateOptions): string[];
}

/** Shared detector library. Centralizes logic so rules stay declarative-ish. */
export interface DetectorToolkit {
  /** Unicode NFKC normalization (composes half-width kana + dakuten → e.g. ﾄﾞ → ド). */
  nfkc(input: string): string;
  /** Map a single character, passing through unmapped characters unchanged. */
  charMap(map: ReadonlyMap<string, string>): (ch: string) => string;
  /** Apply a char map across a string by code point (surrogate-safe). */
  applyCharMap(map: ReadonlyMap<string, string>, input: string): string;
  /** Scan with a regex and emit one LintIssue per match. */
  regexReplace(opts: RegexReplaceOptions): LintIssue[];
  /** Detect incorrect unit notations with per-span de-duplication (Tier A). */
  detectUnits(opts: UnitDetectorOptions): LintIssue[];
  /** Find occurrences of fixed vocabulary, escaped and ordered by position. */
  matchWordList(text: string, words: ReadonlyArray<string>): WordListMatch[];
  /** Remove duplicate issues. Default key is `${ruleId}:${from}-${to}:${replacement}`. */
  dedupe(issues: LintIssue[], key?: (issue: LintIssue) => string): LintIssue[];
  /** Filter morphological tokens by a predicate. */
  posFilter(tokens: ReadonlyArray<Token>, pred: (t: Token) => boolean): Token[];
  /** Build a legacy JsonRuleMeta from ruleset metadata (constructor boilerplate helper). */
  toJsonRuleMeta(rule: RulesetRuleMeta, manifest: RulesetManifest): JsonRuleMeta;
  /** Dictionary access (fails safe when unavailable). */
  dict: DictToolkit;
}

/** Resolved external dependency state for a ruleset build. */
export interface RulesetDeps {
  /** Requirement label (e.g. "dict:genji") → satisfied. */
  requirements: ReadonlyMap<string, boolean>;
  /** Current dictionary health state. */
  dictState: GenjiHealthState;
}

/** The object passed to `RulesetModule.createRules`. */
export interface RulesetContext {
  engineApi: number;
  bases: RulesetBases;
  toolkit: DetectorToolkit;
  deps: RulesetDeps;
}

/** Re-export for convenience so rule code can type its config. */
export type { LintRuleConfig };
