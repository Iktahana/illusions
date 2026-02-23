/**
 * LLM validation prompt templates.
 *
 * Prompt content is inlined as TypeScript strings to avoid webpack
 * asset/source .md imports that break the Next.js RSC bundler.
 *
 * Placeholders resolved at runtime:
 *   {{CONTEXT}}, {{RULE_ID}}, {{FROM}}, {{TO}}, {{MESSAGE_JA}}, {{VALIDATION_HINT}}
 */

// ---------------------------------------------------------------------------
// Shared rules (source of truth: shared-rules.md)
// ---------------------------------------------------------------------------

const sharedRulesMd = `1. **判定基準（絶対原則）**
   - \`{"valid": true}\`: 指摘が【完全に正しく】著者が修正すべき場合のみ。
   - \`{"valid": false}\`: 機械の誤検知、または表現技法。迷った場合はすべて \`false\`。
2. **トークン分割エラー（即時 false）**
   - 対象箇所 \`<< >>\` の前後を必ず確認してください。
   - \`<<カウンタ>>ー\`、\`深夜三<<時>>\`、\`<<しれ>>ない\` のように、一つの単語・熟語・単位を不自然に分断している形態素解析のエラーはすべて \`false\`。
3. **純文学の表現技法（false）**
   - 小説におけるリズム作りのための「の」の連続、体言止めの連続、意図的な表記ゆれ（時/とき、物/もの、為/ため）は表現技法です。機械的な統一ルールは適用せず \`false\`。
4. **文法・品詞の誤認（false）**
   - 擬音語（ぽたり等）や、現代の並列表現（〜たり〜たり）を、文語調や古文法と誤認している指摘は \`false\`。
5. **除外対象（false）**
   - 固有名詞、引用文に対する指摘。`;

// ---------------------------------------------------------------------------
// Candidate validator (source of truth: candidate-validator.md)
// ---------------------------------------------------------------------------

const candidateValidatorMd = `/no_think
日本語校正の専門家として、以下の指摘が正しいか判定してください。

## 判定の絶対ルール（JSONの \\\`valid\\\` の意味）
- {"valid": true} : この指摘は正しい。著者に修正を促すべき。（True Positive）
- {"valid": false} : この指摘は機械の誤検知、または小説表現として許容すべき。無視してよい。（False Positive）

## ルール
{{SHARED_RULES}}

## 文脈
{{CONTEXT}}

## 指摘
- 文体モード: {{MODE}}
- ルールID: {{RULE_ID}}
- 対象: {{FROM}}–{{TO}}
- 問題: {{MESSAGE_JA}}
{{VALIDATION_HINT}}

## 回答
JSON: {"valid":true, "reason":"16文字以内で理由を記述"} // validがtrueなら正しい指摘、falseなら誤検知`;

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
