/**
 * Contract tests for the settings-nav fuzzy match helper.
 */

import { describe, it, expect } from "vitest";

import { matchesQuery, normalizeForSearch } from "../fuzzy-match";

describe("matchesQuery — empty query", () => {
  it("returns true for any label when the query is empty", () => {
    expect(matchesQuery("AI API 接続", "")).toBe(true);
    expect(matchesQuery("", "")).toBe(true);
  });

  it("treats whitespace-only queries as empty", () => {
    expect(matchesQuery("文字組み", "   ")).toBe(true);
  });
});

describe("matchesQuery — substring pass", () => {
  it("matches direct substrings (Japanese)", () => {
    expect(matchesQuery("文字組み", "文字")).toBe(true);
    expect(matchesQuery("音声読み上げ", "読み上げ")).toBe(true);
  });

  it("matches case-insensitively (ASCII)", () => {
    expect(matchesQuery("AI API 接続", "ai")).toBe(true);
    expect(matchesQuery("AI API 接続", "API")).toBe(true);
  });

  it("folds full-width ASCII via NFKC", () => {
    // Full-width "ＡＩ" normalizes to "AI"
    expect(matchesQuery("ＡＩ API 接続", "ai")).toBe(true);
  });
});

describe("matchesQuery — subsequence pass", () => {
  it("matches when query characters appear in order with gaps", () => {
    // "aピ" — 'a' from "API", 'ピ' from the next token of a compound label
    expect(matchesQuery("AI APIピン", "aピ")).toBe(true);
  });

  it("matches skipping intermediate characters in Japanese", () => {
    // 'ス' from スクロール, 'き' from 縦書き
    expect(matchesQuery("スクロールと縦書き", "スき")).toBe(true);
  });

  it("requires in-order chars (wrong order → no match)", () => {
    expect(matchesQuery("スクロールと縦書き", "きス")).toBe(false);
  });

  it("rejects when a required char is missing", () => {
    expect(matchesQuery("スクロールと縦書き", "xyz")).toBe(false);
  });
});

describe("normalizeForSearch", () => {
  it("lowercases ASCII", () => {
    expect(normalizeForSearch("API")).toBe("api");
  });

  it("applies NFKC folding to full-width forms", () => {
    expect(normalizeForSearch("ＡＩ")).toBe("ai");
  });
});
