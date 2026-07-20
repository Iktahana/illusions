/**
 * Shared content-word → dictionary-headword extraction.
 *
 * The "辞書外語" (out-of-dictionary) lint rule runs in the worker but its
 * membership data must be prewarmed on the renderer (where `getDictAccess()`
 * works). The renderer therefore extracts the SAME candidate headwords the rule
 * will query, batch-looks-them-up, and ships the result as a snapshot.
 *
 * IMPORTANT: the external ruleset (illusions-lab/illusions-ruleset-genji-vocab)
 * vendors a byte-identical copy of this logic in its rule. They MUST stay in
 * sync — if the renderer extracts a different headword than the rule queries,
 * the rule simply finds no snapshot entry and skips that token (a false
 * negative, never a false positive). Keep the selection rules below stable.
 */
import type { Token } from "@/lib/nlp-client/types";

export interface DictCandidateOptions {
  /** Include 固有名詞 (proper nouns: names, places). Default true. */
  includeProperNouns?: boolean;
  /** Include 動詞/形容詞 (matched by basic form). Default true. */
  includeVerbsAdjectives?: boolean;
  /** Skip headwords shorter than this (in code points). Default 1. */
  minLength?: number;
}

/** 名詞 subtypes that are never meaningful dictionary headwords. */
const EXCLUDED_NOUN_DETAILS = new Set(["数", "代名詞", "非自立", "接尾", "特殊"]);
/** 動詞/形容詞 subtypes that are auxiliary, not real lexical entries. */
const EXCLUDED_VERB_ADJ_DETAILS = new Set(["非自立", "接尾"]);

const ALL_ASCII = /^[\x00-\x7F]+$/;

function isValidHeadword(key: string, minLength: number): boolean {
  if (key.length === 0 || key === "*") return false;
  if ([...key].length < minLength) return false;
  // Pure ASCII (English words, digits, punctuation, kaomoji) are not Genji
  // headwords — skip them so they never get flagged.
  if (ALL_ASCII.test(key)) return false;
  return true;
}

/**
 * The dictionary headword this token should be looked up under, or `null` if the
 * token is not a checkable content word.
 *
 * - 名詞 → surface form (`surface`).
 * - 動詞 / 形容詞 → basic form (`basic_form`), falling back to surface.
 */
export function dictCandidateTerm(token: Token, opts: DictCandidateOptions = {}): string | null {
  const includeProperNouns = opts.includeProperNouns ?? true;
  const includeVerbsAdjectives = opts.includeVerbsAdjectives ?? true;
  const minLength = opts.minLength ?? 1;
  const detail = token.pos_detail_1;

  if (token.pos === "名詞") {
    if (detail && EXCLUDED_NOUN_DETAILS.has(detail)) return null;
    if (!includeProperNouns && detail === "固有名詞") return null;
    const key = token.surface;
    return isValidHeadword(key, minLength) ? key : null;
  }

  if (includeVerbsAdjectives && (token.pos === "動詞" || token.pos === "形容詞")) {
    if (detail && EXCLUDED_VERB_ADJ_DETAILS.has(detail)) return null;
    const base = token.basic_form && token.basic_form !== "*" ? token.basic_form : token.surface;
    return isValidHeadword(base, minLength) ? base : null;
  }

  return null;
}

/** Deduplicated list of dictionary headwords to prewarm for a set of tokens. */
export function collectDictCandidateTerms(
  tokens: ReadonlyArray<Token>,
  opts: DictCandidateOptions = {},
): string[] {
  const seen = new Set<string>();
  for (const token of tokens) {
    const term = dictCandidateTerm(token, opts);
    if (term) seen.add(term);
  }
  return [...seen];
}
