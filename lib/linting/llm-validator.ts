import type { CorrectionCandidate } from "./types";
import type { ILlmClient } from "@/lib/llm-client/types";
import { CANDIDATE_VALIDATOR_PROMPT } from "@/prompts/lint-validation";

/**
 * LlmValidator — batch-validates CorrectionCandidates using an LLM.
 *
 * Candidates with skipValidation=true are passed through without calling the LLM.
 * Candidates that need validation are checked against the LLM to filter
 * false positives before they are shown to the user.
 *
 * Prompt template: prompts/lint-validation/index.ts (CANDIDATE_VALIDATOR_PROMPT)
 */
export class LlmValidator {
  private mode: string = "novel";

  constructor(private readonly llmClient: ILlmClient) {}

  /** Set the current correction mode for context-aware validation */
  setMode(mode: string): void {
    this.mode = mode;
  }

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
   * Build a validation prompt for a single candidate.
   */
  private buildValidationPrompt(candidate: CorrectionCandidate): string {
    return CANDIDATE_VALIDATOR_PROMPT
      .replace("{{MODE}}", this.mode)
      .replace("{{CONTEXT}}", candidate.context)
      .replace("{{RULE_ID}}", candidate.ruleId)
      .replace("{{FROM}}", String(candidate.from))
      .replace("{{TO}}", String(candidate.to))
      .replace("{{MESSAGE_JA}}", candidate.messageJa)
      .replace("{{VALIDATION_HINT}}", "");
  }

  /**
   * Parse a JSON {"valid": true/false} validation response.
   * Defaults to true (keep) if the response is ambiguous.
   */
  private parseValidationResponse(responseText: string): boolean {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed: unknown = JSON.parse(jsonMatch[0]);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "valid" in parsed &&
          typeof (parsed as Record<string, unknown>).valid === "boolean"
        ) {
          return (parsed as { valid: boolean }).valid;
        }
      }
    } catch {
      // Fall through to default
    }
    // Default to keeping the candidate for any ambiguous response
    return true;
  }
}
