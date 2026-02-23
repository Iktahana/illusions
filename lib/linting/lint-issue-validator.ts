/**
 * LLM-based post-validator for L1/L2 lint issues.
 * Batch-sends issues to the LLM to filter out false positives.
 *
 * Prompt template: prompts/lint-validation/index.ts (ISSUE_VALIDATOR_PROMPT)
 */

import type { ILlmClient } from "@/lib/llm-client/types";
import type { LintIssue } from "./types";
import { ISSUE_VALIDATOR_PROMPT } from "@/prompts/lint-validation";

/** Issue with its surrounding paragraph context */
export interface ValidatableIssue extends LintIssue {
  paragraphText: string;
}

/** Maximum number of issues per LLM call (~50 tokens each) */
const MAX_ISSUES_PER_BATCH = 50;

/** Characters of context to include before/after the flagged text */
const CONTEXT_CHARS = 30;

/**
 * Post-validates L1/L2 lint issues using an LLM.
 * Issues judged as false positives are returned in a dismissed set.
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
   * Validate a batch of L1/L2 issues using the LLM.
   * Returns a Set of issue keys that the LLM judged as false positives (dismissed).
   */
  async validate(
    issues: ReadonlyArray<ValidatableIssue>,
    llmClient: ILlmClient,
    signal?: AbortSignal,
  ): Promise<Set<string>> {
    const dismissed = new Set<string>();

    if (issues.length === 0) return dismissed;

    // Split into batches if needed
    const batches: ValidatableIssue[][] = [];
    for (let i = 0; i < issues.length; i += MAX_ISSUES_PER_BATCH) {
      batches.push(issues.slice(i, i + MAX_ISSUES_PER_BATCH) as ValidatableIssue[]);
    }

    for (const batch of batches) {
      if (signal?.aborted) break;

      try {
        const prompt = this.buildPrompt(batch);
        const result = await llmClient.infer(prompt, {
          signal,
          maxTokens: batch.length * 30,
        });
        const parsed = this.parseResponse(result.text, batch.length);

        for (const entry of parsed) {
          if (entry.id >= 0 && entry.id < batch.length && !entry.valid) {
            const issue = batch[entry.id];
            dismissed.add(LintIssueValidator.issueKey(issue, issue.paragraphText));
          }
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") break;
        console.warn("[LintIssueValidator] Batch validation failed:", error);
        // On failure, keep all issues (fail-open)
      }
    }

    return dismissed;
  }

  /**
   * Build the prompt for a batch of issues.
   */
  private buildPrompt(issues: ReadonlyArray<ValidatableIssue>): string {
    const issueLines: string[] = [];

    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i];
      const flaggedText = issue.paragraphText.slice(issue.from, issue.to);
      const contextBefore = issue.paragraphText.slice(
        Math.max(0, issue.from - CONTEXT_CHARS),
        issue.from,
      );
      const contextAfter = issue.paragraphText.slice(
        issue.to,
        Math.min(issue.paragraphText.length, issue.to + CONTEXT_CHARS),
      );

      issueLines.push(
        `[${i}] ルール: ${issue.ruleId}`,
        `   箇所:「${flaggedText}」`,
        `   理由: ${issue.messageJa}`,
        `   前後:「...${contextBefore}<<${flaggedText}>>${contextAfter}...」`,
        "",
      );
    }

    return ISSUE_VALIDATOR_PROMPT
      .replace("{{MODE}}", this.mode)
      .replace("{{ISSUES}}", issueLines.join("\n"));
  }

  /**
   * Parse the LLM response, extracting the JSON array of validation results.
   * Handles malformed output gracefully.
   */
  private parseResponse(
    text: string,
    expectedCount: number,
  ): Array<{ id: number; valid: boolean }> {
    // Try to extract a JSON array from the response
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return [];

    try {
      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];

      const results: Array<{ id: number; valid: boolean }> = [];
      for (const item of parsed) {
        if (
          typeof item === "object" &&
          item !== null &&
          "id" in item &&
          "valid" in item &&
          typeof (item as Record<string, unknown>).id === "number" &&
          typeof (item as Record<string, unknown>).valid === "boolean"
        ) {
          const entry = item as { id: number; valid: boolean };
          if (entry.id >= 0 && entry.id < expectedCount) {
            results.push(entry);
          }
        }
      }

      return results;
    } catch {
      return [];
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
