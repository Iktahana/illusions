/no_think
日本語校正の専門家として、以下の指摘が正しいか判定してください。

## 判定の絶対ルール（JSONの \`valid\` の意味）
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
JSON: {"valid":true, "reason":"16文字以内で理由を記述"} // validがtrueなら正しい指摘、falseなら誤検知
