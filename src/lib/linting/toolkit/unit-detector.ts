/**
 * Unit-notation detector with per-span de-duplication.
 *
 * The audit (Tier A) found that unit rules built from several overlapping regex
 * patterns emit the same issue multiple times — e.g. "2 KW", "2 KHZ", "60 km/H"
 * each produced 2–3 duplicate issues. This detector runs every pattern, then
 * collapses candidates that share a [from,to) span (default), so a single unit
 * occurrence yields exactly one issue.
 */
import type { LintIssue } from "../types";
import type { UnitDetectorOptions } from "../sdk/ruleset-context";
import { toGlobal } from "./regex-replace";

interface Candidate {
  from: number;
  to: number;
  matched: string;
  correct: string;
}

function defaultMessageJa(matched: string, correct: string): string {
  return `JTFスタイルガイドに基づき、単位表記「${matched}」は「${correct}」と表記してください。`;
}

export function detectUnits(opts: UnitDetectorOptions): LintIssue[] {
  const { text, ruleId, severity, units, reference, messageJa, dedup = true } = opts;

  const candidates: Candidate[] = [];
  for (const spec of units) {
    const re = toGlobal(spec.pattern);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      // Already correct → not a violation.
      if (m[0] === spec.correct) continue;
      candidates.push({
        from: m.index,
        to: m.index + m[0].length,
        matched: m[0],
        correct: spec.correct,
      });
    }
  }

  const buildMessageJa = messageJa ?? defaultMessageJa;
  const seen = new Set<string>();
  const issues: LintIssue[] = [];

  for (const c of candidates) {
    if (dedup) {
      const key = `${c.from}-${c.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    issues.push({
      ruleId,
      severity,
      message: `Incorrect unit notation: ${c.matched} -> ${c.correct}`,
      messageJa: buildMessageJa(c.matched, c.correct),
      from: c.from,
      to: c.to,
      originalText: c.matched,
      ...(reference ? { reference } : {}),
      fix: {
        label: `Replace with ${c.correct}`,
        labelJa: `「${c.correct}」に置換`,
        replacement: c.correct,
      },
    });
  }

  return issues;
}
