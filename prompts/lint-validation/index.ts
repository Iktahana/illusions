/**
 * LLM validation prompt templates.
 *
 * Prompt content lives in the sibling .md files:
 *   - shared-rules.md          — shared validation rules (injected as {{SHARED_RULES}})
 *   - candidate-validator.md   — single-issue validator (CANDIDATE_VALIDATOR_PROMPT)
 *
 * Placeholders used in .md files:
 *   {{SHARED_RULES}}   — injected from shared-rules.md
 *   {{MODE}}           — current correction mode (novel, official, blog, academic, sns)
 *   {{CONTEXT}}        — surrounding text for single-candidate validation
 *   {{RULE_ID}}, {{FROM}}–{{TO}}, {{MESSAGE_JA}}, {{VALIDATION_HINT}}
 */

import sharedRulesRaw from "./shared-rules.md";
import candidateValidatorRaw from "./candidate-validator.md";

const assemble = (template: string): string =>
  template.replace("{{SHARED_RULES}}", sharedRulesRaw.trimEnd());

export const CANDIDATE_VALIDATOR_PROMPT: string = assemble(candidateValidatorRaw);
