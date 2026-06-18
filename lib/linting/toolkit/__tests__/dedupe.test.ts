import { describe, it, expect } from "vitest";

import { dedupe, defaultIssueKey } from "../dedupe";
import type { LintIssue } from "../../types";

function issue(over: Partial<LintIssue>): LintIssue {
  return {
    ruleId: "r",
    severity: "warning",
    message: "m",
    messageJa: "m",
    from: 0,
    to: 1,
    fix: { label: "l", labelJa: "l", replacement: "x" },
    ...over,
  };
}

describe("dedupe", () => {
  it("removes issues with the same rule, span, and fix (Tier A/C)", () => {
    const out = dedupe([issue({}), issue({}), issue({ from: 2, to: 3 })]);
    expect(out).toHaveLength(2);
  });

  it("keeps issues that differ in replacement", () => {
    const out = dedupe([
      issue({ fix: { label: "l", labelJa: "l", replacement: "a" } }),
      issue({ fix: { label: "l", labelJa: "l", replacement: "b" } }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("preserves first-seen order", () => {
    const out = dedupe([
      issue({ from: 5, to: 6 }),
      issue({ from: 1, to: 2 }),
      issue({ from: 5, to: 6 }),
    ]);
    expect(out.map((i) => i.from)).toEqual([5, 1]);
  });

  it("supports a custom key (span only, ignoring rule)", () => {
    const out = dedupe(
      [issue({ ruleId: "a" }), issue({ ruleId: "b" })],
      (i) => `${i.from}-${i.to}`,
    );
    expect(out).toHaveLength(1);
  });

  it("defaultIssueKey is rule+span+replacement", () => {
    expect(defaultIssueKey(issue({}))).toBe("r|0-1|x");
  });
});
