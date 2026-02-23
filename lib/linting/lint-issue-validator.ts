/**
 * LLM-based post-validator for L1/L2 lint issues.
 * Validates each issue individually with concurrency control.
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

/** Max concurrent LLM inference calls */
const CONCURRENCY_LIMIT = 3;

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
   * Validate L1/L2 issues one-by-one with concurrency control.
   * Returns a Set of issue keys that the LLM judged as false positives (dismissed).
   */
  async validate(
    issues: ReadonlyArray<ValidatableIssue>,
    llmClient: ILlmClient,
    signal?: AbortSignal,
  ): Promise<Set<string>> {
    const dismissed = new Set<string>();

    if (issues.length === 0) return dismissed;
    if (!llmClient.isAvailable()) return dismissed;

    try {
      const isLoaded = await llmClient.isModelLoaded();
      if (!isLoaded) return dismissed;
    } catch {
      return dismissed;
    }

    // Create one task per issue
    const tasks = issues.map((issue) => async () => {
      if (signal?.aborted) return;

      try {
        const prompt = this.buildSinglePrompt(issue);
        console.debug(`[LintIssueValidator] [${issue.ruleId}] Prompt:\n`, prompt);

        const result = await llmClient.infer(prompt, {
          signal,
          maxTokens: 60,
        });
        console.debug(`[LintIssueValidator] [${issue.ruleId}] Response:\n`, result.text);

        const valid = this.parseSingleResponse(result.text);
        if (valid === false) {
          dismissed.add(LintIssueValidator.issueKey(issue, issue.paragraphText));
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        console.warn(`[LintIssueValidator] Validation failed for ${issue.ruleId}:`, error);
        // Fail-open: keep the issue
      }
    });

    // Run with concurrency limit
    await runConcurrent(tasks, CONCURRENCY_LIMIT, signal);

    return dismissed;
  }

  /**
   * Build a prompt for a single issue using CANDIDATE_VALIDATOR_PROMPT.
   */
  private buildSinglePrompt(issue: ValidatableIssue): string {
    const flaggedText = issue.paragraphText.slice(issue.from, issue.to);
    const contextBefore = issue.paragraphText.slice(
      Math.max(0, issue.from - CONTEXT_CHARS),
      issue.from,
    );
    const contextAfter = issue.paragraphText.slice(
      issue.to,
      Math.min(issue.paragraphText.length, issue.to + CONTEXT_CHARS),
    );

    return CANDIDATE_VALIDATOR_PROMPT
      .replace("{{MODE}}", this.mode)
      .replace("{{CONTEXT}}", `...${contextBefore}<<${flaggedText}>>${contextAfter}...`)
      .replace("{{RULE_ID}}", issue.ruleId)
      .replace("{{FROM}}–{{TO}}", `「${flaggedText}」`)
      .replace("{{MESSAGE_JA}}", issue.messageJa ?? "")
      .replace("{{VALIDATION_HINT}}", "");
  }

  /**
   * Parse a single-issue LLM response: {"valid":true} or {"valid":false}.
   * Returns null on parse failure (fail-open: issue is kept).
   */
  private parseSingleResponse(text: string): boolean | null {
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return null;

    try {
      const parsed: unknown = JSON.parse(match[0]);
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

/**
 * Run async tasks with a concurrency limit.
 */
async function runConcurrent(
  tasks: Array<() => Promise<void>>,
  limit: number,
  signal?: AbortSignal,
): Promise<void> {
  const executing = new Set<Promise<void>>();

  for (const task of tasks) {
    if (signal?.aborted) break;

    const p = task().finally(() => {
      executing.delete(p);
    });
    executing.add(p);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  if (executing.size > 0) {
    await Promise.all(executing);
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
