/**
 * Part-of-speech filtering helpers for morphological (L2) rules.
 *
 * Thin, stable wrappers over token arrays so morphological rule code has a
 * single SDK surface for the common "select tokens matching a predicate" task.
 */
import type { Token } from "@/lib/nlp-client/types";

/** Return tokens matching `pred`, preserving order. */
export function posFilter(tokens: ReadonlyArray<Token>, pred: (t: Token) => boolean): Token[] {
  return tokens.filter(pred);
}

/** Convenience predicate: token's coarse POS equals `pos`. */
export function isPos(token: Token, pos: string): boolean {
  return token.pos === pos;
}
