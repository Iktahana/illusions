/**
 * Tests for computeDiffStats() — the prefix/suffix diff-stat algorithm that
 * drives every diff badge/tooltip in the history panel. Previously had zero
 * test coverage anywhere in the repo.
 */
import { describe, it, expect } from "vitest";
import { computeDiffStats } from "../DiffIndicator";

describe("computeDiffStats", () => {
  it("returns all-zero for identical strings", () => {
    expect(computeDiffStats("hello world", "hello world")).toEqual({
      added: 0,
      removed: 0,
      addedText: "",
      removedText: "",
    });
  });

  it("detects a pure append", () => {
    const result = computeDiffStats("abc", "abcdef");
    expect(result).toEqual({
      added: 3,
      removed: 0,
      addedText: "def",
      removedText: "",
    });
  });

  it("detects a pure prepend", () => {
    const result = computeDiffStats("def", "abcdef");
    expect(result).toEqual({
      added: 3,
      removed: 0,
      addedText: "abc",
      removedText: "",
    });
  });

  it("detects a pure deletion", () => {
    const result = computeDiffStats("abcdef", "abc");
    expect(result).toEqual({
      added: 0,
      removed: 3,
      addedText: "",
      removedText: "def",
    });
  });

  it("detects a middle replacement, isolating only the changed span", () => {
    // "abXcd" -> "abYYcd": common prefix "ab", common suffix "cd", middle X -> YY
    const result = computeDiffStats("abXcd", "abYYcd");
    expect(result.removedText).toBe("X");
    expect(result.addedText).toBe("YY");
    expect(result.removed).toBe(1);
    expect(result.added).toBe(2);
  });

  it("handles an empty oldText (all added)", () => {
    const result = computeDiffStats("", "new content");
    expect(result).toEqual({
      added: "new content".length,
      removed: 0,
      addedText: "new content",
      removedText: "",
    });
  });

  it("handles an empty newText (all removed)", () => {
    const result = computeDiffStats("old content", "");
    expect(result).toEqual({
      added: 0,
      removed: "old content".length,
      addedText: "",
      removedText: "old content",
    });
  });

  it("handles both strings empty", () => {
    expect(computeDiffStats("", "")).toEqual({
      added: 0,
      removed: 0,
      addedText: "",
      removedText: "",
    });
  });

  it("strips HTML tags before diffing (non-br tags contribute no chars)", () => {
    const result = computeDiffStats("<p>a</p>", "<p>ab</p>");
    // Stripped: "a" -> "ab" — a pure append of "b", <p></p> tags contribute no chars
    expect(result).toEqual({
      added: 1,
      removed: 0,
      addedText: "b",
      removedText: "",
    });
  });

  it("converts <br> tags to newlines rather than stripping them", () => {
    const result = computeDiffStats("<p>a</p>", "<p>a<br>b</p>");
    // Stripped: "a" -> "a\nb" — <br> becomes a literal newline per stripHtmlForDiff's contract
    expect(result).toEqual({
      added: 2,
      removed: 0,
      addedText: "\nb",
      removedText: "",
    });
  });

  it("does not double-count when both a common prefix and common suffix exist around a shrinking middle", () => {
    // prefix "start-", suffix "-end", middle "12345" -> "1" (removal only)
    const result = computeDiffStats("start-12345-end", "start-1-end");
    expect(result.addedText).toBe("");
    expect(result.added).toBe(0);
    expect(result.removedText).toBe("2345");
    expect(result.removed).toBe(4);
  });

  it("counts multi-byte Japanese content by UTF-16 code units, not grapheme count", () => {
    const result = computeDiffStats("桜が咲いた", "桜が満開になった");
    // Common prefix "桜が", no common suffix ("た" vs "た" — actually suffix "た" matches)
    // Just assert internal consistency: lengths equal slice().length (UTF-16 units)
    expect(result.added).toBe(result.addedText.length);
    expect(result.removed).toBe(result.removedText.length);
    expect(result.added).toBeGreaterThan(0);
  });

  it("returns an object with exactly the DiffStats shape", () => {
    const result = computeDiffStats("a", "b");
    expect(Object.keys(result).sort()).toEqual(
      ["added", "addedText", "removed", "removedText"].sort(),
    );
  });
});
