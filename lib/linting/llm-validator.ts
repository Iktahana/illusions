import type { CorrectionCandidate } from "./types";
import type { ILlmClient } from "@/lib/llm-client/types";

/**
 * LlmValidator — batch-validates CorrectionCandidates using an LLM.
 *
 * Candidates with skipValidation=true are passed through without calling the LLM.
 * Candidates that need validation are checked against the LLM to filter
 * false positives before they are shown to the user.
 */
export class LlmValidator {
  constructor(private readonly llmClient: ILlmClient) {}

  /**
   * Validate a batch of candidates.
   * Returns only candidates that pass validation (or are marked skipValidation).
   *
   * @param candidates - Candidates to validate
   * @param signal - Optional AbortSignal for cancellation
   */
  async validate(
    candidates: CorrectionCandidate[],
    signal?: AbortSignal,
  ): Promise<CorrectionCandidate[]> {
    const toValidate = candidates.filter((c) => !c.skipValidation);
    const skipValidation = candidates.filter((c) => c.skipValidation);

    if (toValidate.length === 0) return candidates;

    // Validate candidates that require LLM review
    const validated: CorrectionCandidate[] = [];
    for (const candidate of toValidate) {
      if (signal?.aborted) break;
      const isValid = await this.validateOne(candidate, signal);
      if (isValid) validated.push(candidate);
    }

    return [...skipValidation, ...validated];
  }

  /**
   * Validate a single candidate using the LLM.
   * Returns true if the candidate should be kept, false if it should be discarded.
   * On error, defaults to keeping the candidate (fail-open).
   */
  private async validateOne(
    candidate: CorrectionCandidate,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (!this.llmClient.isAvailable()) return true;

    try {
      const isLoaded = await this.llmClient.isModelLoaded();
      if (!isLoaded) return true;

      const prompt = this.buildValidationPrompt(candidate);
      const result = await this.llmClient.infer(prompt, {
        signal,
        maxTokens: 64,
      });

      return this.parseValidationResponse(result.text);
    } catch {
      // On any error (including AbortError), keep the candidate
      return true;
    }
  }

  /**
   * Build a compact validation prompt for a single candidate.
   */
  private buildValidationPrompt(candidate: CorrectionCandidate): string {
    const hint = candidate.ruleId
      ? `ルールID: ${candidate.ruleId}`
      : "";
    const validationHint = "";

    return `/no_think
日本語校正の専門家として、以下の指摘が正しいか判定してください。

## 文脈
${candidate.context}

## 指摘
- 対象文字位置: ${candidate.from}–${candidate.to}
- 問題: ${candidate.messageJa}
${hint}
${validationHint}

## 指示
この指摘は正しいですか？「YES」か「NO」のみ回答してください。`;
  }

  /**
   * Parse a YES/NO validation response.
   * Defaults to true (keep) if the response is ambiguous.
   */
  private parseValidationResponse(responseText: string): boolean {
    const normalized = responseText.trim().toUpperCase();
    if (normalized.startsWith("NO")) return false;
    // Default to keeping the candidate for any other response
    return true;
  }
}
