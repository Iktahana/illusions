/**
 * LLM validation prompt templates.
 * Source of truth: shared-rules.md, candidate-validator.md
 *
 * Placeholders resolved at runtime:
 *   {{CONTEXT}}, {{RULE_ID}}, {{FROM}}, {{TO}}, {{MESSAGE_JA}}, {{VALIDATION_HINT}}
 */

import sharedRulesMd from "./shared-rules.md";
import candidateValidatorMd from "./candidate-validator.md";

// ---------------------------------------------------------------------------
// Single-candidate validator prompt (used by LintIssueValidator)
// ---------------------------------------------------------------------------

export const CANDIDATE_VALIDATOR_PROMPT: string =
  candidateValidatorMd.replace("{{SHARED_RULES}}", sharedRulesMd);

// ---------------------------------------------------------------------------
// Batch validator prompt — kept for reference, not currently used
// ---------------------------------------------------------------------------

export const ISSUE_VALIDATOR_PROMPT = `/no_think
あなたは日本語校正AIです。以下の校正指摘が正しいか判定してください。
文脈を考慮し、誤検知(false positive)の場合はfalseとしてください。

## ルール
${sharedRulesMd}

## 指摘一覧
{{ISSUES}}

## 回答
JSON配列のみ: [{"id":0,"valid":true,"reason":"簡潔な判定理由"},...]`;
