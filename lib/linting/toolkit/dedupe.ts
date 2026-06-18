/**
 * Issue de-duplication.
 *
 * Multiple patterns (within a rule or across rules) frequently flag the same
 * span — the root cause of the Tier A "duplicate unit notation" and Tier C
 * "triple-detected punctuation" audit findings. `dedupe` collapses issues that
 * share the same key, keeping the first occurrence (detection order).
 */
import type { LintIssue } from "../types";

/** Default identity: same rule + same span + same fix. */
export function defaultIssueKey(issue: LintIssue): string {
  const replacement = issue.fix?.replacement ?? "";
  return [issue.ruleId, `${issue.from}-${issue.to}`, replacement].join("|");
}

/** Remove duplicate issues, preserving first-seen order. */
export function dedupe(
  issues: LintIssue[],
  key: (issue: LintIssue) => string = defaultIssueKey,
): LintIssue[] {
  const seen = new Set<string>();
  const out: LintIssue[] = [];
  for (const issue of issues) {
    const k = key(issue);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(issue);
  }
  return out;
}
