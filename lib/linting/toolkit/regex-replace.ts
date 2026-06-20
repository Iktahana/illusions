/**
 * Regex-based detection helper.
 *
 * Scans `text` with `pattern` and emits one LintIssue per match. The pattern is
 * always cloned with the global flag so callers can pass a shared/literal regex
 * without worrying about a stale `lastIndex`. Zero-width matches are skipped and
 * cannot cause an infinite loop.
 */
import type { LintIssue } from "../types";
import type { RegexReplaceOptions } from "../sdk/ruleset-context";

/** Clone a regex, guaranteeing the global flag. */
export function toGlobal(pattern: RegExp): RegExp {
  return pattern.flags.includes("g")
    ? new RegExp(pattern.source, pattern.flags)
    : new RegExp(pattern.source, `${pattern.flags}g`);
}

export function regexReplace(opts: RegexReplaceOptions): LintIssue[] {
  const {
    text,
    pattern,
    ruleId,
    severity,
    message,
    messageJa,
    replacement,
    span,
    reference,
    fixLabel,
    fixLabelJa,
  } = opts;

  const issues: LintIssue[] = [];
  const re = toGlobal(pattern);
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    // Guard against zero-width matches looping forever.
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }

    const { from, to, original } = span
      ? span(m)
      : { from: m.index, to: m.index + m[0].length, original: m[0] };

    const replacementText = replacement(m);
    issues.push({
      ruleId,
      severity,
      message,
      messageJa,
      from,
      to,
      originalText: original,
      ...(reference ? { reference } : {}),
      fix: {
        label: fixLabel ?? `Replace with ${replacementText}`,
        labelJa: fixLabelJa ?? `「${replacementText}」に置換`,
        replacement: replacementText,
      },
    });
  }

  return issues;
}
