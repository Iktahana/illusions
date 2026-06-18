import { describe, it, expect } from "vitest";

import { regexReplace, toGlobal } from "../regex-replace";

const BASE = {
  ruleId: "test-rule",
  severity: "warning" as const,
  message: "msg",
  messageJa: "メッセージ",
};

describe("toGlobal", () => {
  it("adds the global flag and preserves others", () => {
    expect(toGlobal(/a/i).flags).toBe("gi"); // JS normalizes flag order
    expect(toGlobal(/a/g).flags).toBe("g");
  });
});

describe("regexReplace", () => {
  it("emits one issue per match with correct offsets and fix", () => {
    const issues = regexReplace({
      ...BASE,
      text: "a！b！c",
      pattern: /！/,
      replacement: () => "!",
    });
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({ from: 1, to: 2, originalText: "！" });
    expect(issues[0].fix?.replacement).toBe("!");
    expect(issues[1].from).toBe(3);
  });

  it("works with a non-global pattern (cloned internally, no shared lastIndex)", () => {
    const re = /x/;
    const a = regexReplace({ ...BASE, text: "xx", pattern: re, replacement: () => "y" });
    const b = regexReplace({ ...BASE, text: "xx", pattern: re, replacement: () => "y" });
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2); // not affected by previous run
    expect(re.lastIndex).toBe(0);
  });

  it("does not loop forever on zero-width matches", () => {
    const issues = regexReplace({ ...BASE, text: "abc", pattern: /(?=b)/, replacement: () => "!" });
    expect(issues).toHaveLength(0);
  });

  it("supports a custom span", () => {
    const issues = regexReplace({
      ...BASE,
      text: "12，34",
      pattern: /\d，\d/,
      replacement: () => ",",
      span: (m) => ({ from: m.index + 1, to: m.index + 2, original: "，" }),
    });
    // "12，34": pattern matches "2，3" at index 1, so the comma is at index 2.
    expect(issues[0]).toMatchObject({ from: 2, to: 3, originalText: "，" });
  });
});
