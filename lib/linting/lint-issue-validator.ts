/**
 * LLM-based post-validator for L1/L2 lint issues.
 * Sends issues to the LLM one at a time to filter out false positives.
 *
 * Prompt template: prompts/lint-validation/index.ts (CANDIDATE_VALIDATOR_PROMPT)
 */

import type { ILlmClient } from "@/lib/llm-client/types";
import type { LintIssue } from "./types";
import { CANDIDATE_VALIDATOR_PROMPT } from "@/prompts/lint-validation";

/** Issue with its surrounding paragraph context */
export interface ValidatableIssue extends LintIssue {
  paragraphText: string;
}

/** Characters of context to include before/after the flagged text */
const CONTEXT_CHARS = 50;

/**
 * Post-validates L1/L2 lint issues using an LLM.
 * Issues judged as false positives are returned with valid=false.
 * Each issue is sent as a separate LLM call.
 */
export class LintIssueValidator {
  private mode: string = "novel";

  /** Set the current correction mode for context-aware validation */
  setMode(mode: string): void {
    this.mode = mode;
  }

  /**
   * Generate a stable cache key for a lint issue in its paragraph context.
   * Format: `ruleId:from:to:paragraphHash`
   */
  static issueKey(issue: LintIssue, paragraphText: string): string {
    return `${issue.ruleId}:${issue.from}:${issue.to}:${hashString(paragraphText)}`;
  }

  /**
   * Validate issues one by one using the LLM.
   * Returns a Map of issue keys → { valid, reason } for all validated issues.
   *
   * @param onIssueValidated - Optional callback fired immediately after each
   *   issue result is parsed. Use this for incremental UI updates.
   */
  async validate(
    issues: ReadonlyArray<ValidatableIssue>,
    llmClient: ILlmClient,
    signal?: AbortSignal,
    onIssueValidated?: (key: string, valid: boolean) => void,
  ): Promise<Map<string, { valid: boolean; reason?: string }>> {
    const results = new Map<string, { valid: boolean; reason?: string }>();

    if (issues.length === 0) return results;

    for (const issue of issues) {
      if (signal?.aborted) break;

      const key = LintIssueValidator.issueKey(issue, issue.paragraphText);

      try {
        const prompt = this.buildPrompt(issue);
        console.debug('[LintIssueValidator] prompt:\n', prompt);
        const result = await llmClient.infer(prompt, {
          signal,
          maxTokens: 60,
        });
        console.debug('[LintIssueValidator] raw LLM response:\n', result.text);
        console.debug('[LintIssueValidator] tokens used:', result.tokenCount);

        const parsed = this.parseResponse(result.text);
        const valid = parsed ?? true; // fail-open if unparseable
        const flagged = issue.paragraphText.slice(issue.from, issue.to);
        const verdict = valid ? 'CONFIRMED' : 'DISMISSED';
        console.debug(`[LintIssueValidator] ${verdict}:`, issue.ruleId, flagged);

        results.set(key, { valid });
        onIssueValidated?.(key, valid);
      } catch (error) {
        if ((error as Error).name === "AbortError") break;
        console.warn("[LintIssueValidator] Validation failed:", error);
        // On failure, keep the issue (fail-open)
        results.set(key, { valid: true });
        onIssueValidated?.(key, true);
      }
    }

    return results;
  }

  /**
   * Build the prompt for a single issue using CANDIDATE_VALIDATOR_PROMPT.
   */
  private buildPrompt(issue: ValidatableIssue): string {
    const flaggedText = issue.paragraphText.slice(issue.from, issue.to);
    const contextBefore = issue.paragraphText.slice(
      Math.max(0, issue.from - CONTEXT_CHARS),
      issue.from,
    );
    const contextAfter = issue.paragraphText.slice(
      issue.to,
      Math.min(issue.paragraphText.length, issue.to + CONTEXT_CHARS),
    );

    const context = `...${contextBefore}<<${flaggedText}>>${contextAfter}...`;

    return CANDIDATE_VALIDATOR_PROMPT
      .replace("{{MODE}}", this.mode)
      .replace("{{CONTEXT}}", context)
      .replace("{{RULE_ID}}", issue.ruleId)
      .replace("{{FROM}}", String(issue.from))
      .replace("{{TO}}", String(issue.to))
      .replace("{{MESSAGE_JA}}", issue.messageJa)
      .replace("{{VALIDATION_HINT}}", "");
  }

  /**
   * Parse the LLM response, extracting the valid boolean from a JSON object.
   * Returns null if the response cannot be parsed.
   */
  private parseResponse(text: string): boolean | null {
    // Try to extract {"valid": true/false} from the response
    const jsonMatch = text.match(/\{[^}]*"valid"\s*:\s*(true|false)[^}]*\}/);
    if (!jsonMatch) return null;

    try {
      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "valid" in parsed &&
        typeof (parsed as Record<string, unknown>).valid === "boolean"
      ) {
        return (parsed as { valid: boolean }).valid;
      }
      return null;
    } catch {
      return null;
    }
  }
}

/** Simple string hash (same as decoration-plugin.ts hashString) */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return (hash >>> 0).toString(16);
}
