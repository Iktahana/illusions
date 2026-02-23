/**
 * LLM validation prompt templates.
 *
 * Placeholders:
 *   {{MODE}}    — current correction mode (novel, official, blog, academic, sns)
 *   {{ISSUES}}  — formatted issue list for batch validation
 *   {{CONTEXT}} — surrounding text for single-candidate validation
 *   {{RULE_ID}}, {{FROM}}, {{TO}}, {{MESSAGE_JA}}, {{VALIDATION_HINT}}
 */

// ---------------------------------------------------------------------------
// Shared rules (injected into both prompts)
// ---------------------------------------------------------------------------

const SHARED_RULES = `\
1. **文体モード**: 現在のモードは「{{MODE}}」です。そのモードに適した表現かどうかを判断してください。
2. **擬音語・擬態語（オノマトペ）**: 「ぽたり」「ばたり」「がたり」等の擬音語・擬態語は文語表現ではありません。文語調ルール等で指摘されている場合は誤検知としてください。
3. **慣用表現**: 「食べたり飲んだり」等の現代語の並列表現「〜たり〜たり」は文語の完了「たり」ではありません。誤検知としてください。
4. **固有名詞・引用**: 固有名詞や引用文中の表現は指摘対象外です。誤検知としてください。
5. **文脈上自然な表現**: 前後の文脈から自然な表現であれば誤検知としてください。文脈を無視した機械的な指摘は誤検知です。
6. **助数詞・単位・複合語**: 「三時」「一時間」「時計」など、漢字が助数詞・単位・複合語の一部として使われている場合は、表記ゆれの対象外です。誤検知としてください。
7. **判断基準**: 指摘が文脈上明確に正しい場合のみ正しいと判定してください。少しでも疑わしければ誤検知（偽陽性を減らす方針）。`;

// ---------------------------------------------------------------------------
// Batch validator prompt (L1/L2 issues)
// ---------------------------------------------------------------------------

export const ISSUE_VALIDATOR_PROMPT = `/no_think
あなたは日本語校正AIです。以下の校正指摘が正しいか判定してください。
文脈を考慮し、誤検知(false positive)の場合はfalseとしてください。

## ルール
${SHARED_RULES}

## 指摘一覧
{{ISSUES}}

## 回答
JSON配列のみ: [{"id":0,"valid":true,"reason":"簡潔な判定理由"},...]`;

// ---------------------------------------------------------------------------
// Single-candidate validator prompt (CorrectionCandidate)
// ---------------------------------------------------------------------------

export const CANDIDATE_VALIDATOR_PROMPT = `/no_think
日本語校正の専門家として、以下の指摘が正しいか判定してください。

## ルール
${SHARED_RULES}

## 文脈
{{CONTEXT}}

## 指摘
- ルールID: {{RULE_ID}}
- 対象: {{FROM}}–{{TO}}
- 問題: {{MESSAGE_JA}}
{{VALIDATION_HINT}}

## 回答
JSON: {"valid":true,"reason":"16文字以内で理由を記述"} // validがtrueなら正しい指摘、falseなら誤検知`;
