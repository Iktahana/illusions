import type { ILlmClient } from "@/lib/llm-client/types";

import { AbstractLlmLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig } from "../types";

export class HomophoneDetectionRule extends AbstractLlmLintRule {
  readonly id = "homophone-detection";
  readonly name = "Homophone Detection";
  readonly nameJa = "同音異義語の検出";
  readonly description =
    "Detects contextually incorrect homophone usage using LLM analysis";
  readonly descriptionJa =
    "LLMによる文脈分析で、同音異義語の誤用を検出します";
  readonly defaultConfig = { enabled: true, severity: "warning" as const };

  async lintWithLlm(
    sentences: ReadonlyArray<{ text: string; from: number; to: number }>,
    config: LintRuleConfig,
    llmClient: ILlmClient,
    signal?: AbortSignal,
  ): Promise<LintIssue[]> {
    if (sentences.length === 0) return [];

    const prompt = this.buildPrompt(sentences);
    const result = await llmClient.infer(prompt, { signal, maxTokens: 1024 });
    return this.parseResponse(result.text, sentences, config);
  }

  private buildPrompt(
    sentences: ReadonlyArray<{ text: string; from: number; to: number }>,
  ): string {
    const text = sentences.map((s, i) => `[${i}] ${s.text}`).join("\n");

    return `/no_think
あなたは日本語校正の専門家です。以下の文章から同音異義語の誤用を検出してください。

## ルール
- 文脈に合わない同音異義語の使用を指摘する
- 一般的な誤用パターン: 異常/以上, 意志/意思, 過程/家庭/仮定, 機関/期間/器官, 制作/製作, 対象/対称/対照, etc.
- 明らかに正しい用法は指摘しない
- 確信度が低い場合は指摘しない

## 出力形式
JSON配列で回答してください。問題がない場合は空配列 [] を返してください。
\`\`\`json
[
  {
    "sentenceIndex": 0,
    "word": "誤用された単語",
    "suggestion": "正しい候補",
    "reason": "理由の簡潔な説明"
  }
]
\`\`\`

## テキスト
${text}`;
  }

  private parseResponse(
    responseText: string,
    sentences: ReadonlyArray<{ text: string; from: number; to: number }>,
    config: LintRuleConfig,
  ): LintIssue[] {
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) return [];

      const results = JSON.parse(jsonMatch[0]) as Array<{
        sentenceIndex: number;
        word: string;
        suggestion: string;
        reason: string;
      }>;

      return results
        .filter(
          (r) =>
            r.sentenceIndex >= 0 &&
            r.sentenceIndex < sentences.length &&
            typeof r.word === "string" &&
            typeof r.suggestion === "string",
        )
        .map((r) => {
          const sentence = sentences[r.sentenceIndex];
          const wordIndex = sentence.text.indexOf(r.word);
          const from =
            wordIndex >= 0 ? sentence.from + wordIndex : sentence.from;
          const to = wordIndex >= 0 ? from + r.word.length : sentence.to;

          return {
            ruleId: this.id,
            severity: config.severity,
            message: `Possible homophone misuse: "${r.word}" may be "${r.suggestion}" (${r.reason})`,
            messageJa: `「${r.word}」は文脈上「${r.suggestion}」の誤用の可能性があります（${r.reason}）`,
            from,
            to,
            fix: {
              label: `Replace with "${r.suggestion}"`,
              labelJa: `「${r.suggestion}」に置換`,
              replacement: r.suggestion,
            },
            reference: {
              standard: "LLM文脈分析",
              section: "同音異義語",
            },
          };
        });
    } catch {
      console.error(
        "Failed to parse homophone detection response:",
        responseText,
      );
      return [];
    }
  }
}
