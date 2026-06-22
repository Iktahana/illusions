/**
 * Tests for the known-terms registry that suppresses 辞書外語 marks for words
 * the user (or another dictionary ruleset) has registered.
 *
 * Locks:
 * - applyKnownTermsToSnapshot overrides only candidate terms in the known set,
 *   leaves misses untouched, and is a no-op for an empty known set.
 * - collectKnownTerms unions every registered source and is fail-safe (one
 *   throwing source does not break the others).
 * - The built-in user-dictionary source reads from the right storage key for
 *   project vs standalone mode (standalone uses filePath, falling back to
 *   fileName).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DictLookup } from "@/lib/dict/dict-types";
import type { EditorMode } from "@/lib/project/project-types";

const loadEntries = vi.fn();
const loadEntriesStandalone = vi.fn();

vi.mock("@/lib/services/user-dictionary-service", () => ({
  getUserDictionaryService: () => ({ loadEntries, loadEntriesStandalone }),
  subscribeUserDictionaryChange: () => () => {},
}));

import {
  applyKnownTermsToSnapshot,
  collectKnownTerms,
  registerKnownTermsSource,
  unregisterKnownTermsSource,
} from "../known-terms";

describe("applyKnownTermsToSnapshot", () => {
  it("overrides candidate terms present in the known set to found:true", () => {
    const map = new Map<string, DictLookup>([
      ["造語", { found: false }],
      ["普通", { found: true }],
    ]);
    applyKnownTermsToSnapshot(map, ["造語", "普通"], new Set(["造語"]));
    expect(map.get("造語")).toEqual({ found: true });
  });

  it("leaves misses not in the known set untouched", () => {
    const map = new Map<string, DictLookup>([["未知", { found: false }]]);
    applyKnownTermsToSnapshot(map, ["未知"], new Set(["別の語"]));
    expect(map.get("未知")).toEqual({ found: false });
  });

  it("is a no-op for an empty known set", () => {
    const map = new Map<string, DictLookup>([["x", { found: false }]]);
    applyKnownTermsToSnapshot(map, ["x"], new Set());
    expect(map.get("x")).toEqual({ found: false });
  });

  it("ignores known terms that are not lookup candidates", () => {
    const map = new Map<string, DictLookup>([["x", { found: false }]]);
    applyKnownTermsToSnapshot(map, ["x"], new Set(["not-a-candidate"]));
    expect(map.has("not-a-candidate")).toBe(false);
  });
});

describe("collectKnownTerms", () => {
  beforeEach(() => {
    loadEntries.mockReset();
    loadEntriesStandalone.mockReset();
    loadEntries.mockResolvedValue([]);
    loadEntriesStandalone.mockResolvedValue([]);
  });

  afterEach(() => {
    unregisterKnownTermsSource("test-a");
    unregisterKnownTermsSource("test-b");
    unregisterKnownTermsSource("test-throws");
  });

  it("unions terms from every registered source", async () => {
    registerKnownTermsSource("test-a", () => ["甲", "乙"]);
    registerKnownTermsSource("test-b", () => ["乙", "丙"]);
    // null mode → built-in user-dictionary source contributes nothing.
    const terms = await collectKnownTerms({ editorMode: null });
    expect(terms).toEqual(new Set(["甲", "乙", "丙"]));
  });

  it("is fail-safe: a throwing source does not break the others", async () => {
    registerKnownTermsSource("test-throws", () => {
      throw new Error("boom");
    });
    registerKnownTermsSource("test-a", () => ["生存"]);
    const terms = await collectKnownTerms({ editorMode: null });
    expect(terms.has("生存")).toBe(true);
  });

  it("drops empty strings and non-strings", async () => {
    registerKnownTermsSource("test-a", () => ["有効", ""]);
    const terms = await collectKnownTerms({ editorMode: null });
    expect(terms.has("有効")).toBe(true);
    expect(terms.has("")).toBe(false);
  });

  it("user-dictionary source reads project entries in project mode", async () => {
    loadEntries.mockResolvedValue([
      { id: "1", word: "幻燈" },
      { id: "2", word: "" },
    ]);
    const mode: EditorMode = {
      type: "project",
      projectId: "p1",
    } as EditorMode;
    const terms = await collectKnownTerms({ editorMode: mode });
    expect(loadEntries).toHaveBeenCalled();
    expect(terms.has("幻燈")).toBe(true);
    expect(terms.has("")).toBe(false);
  });

  it("user-dictionary source uses filePath as the standalone key", async () => {
    loadEntriesStandalone.mockResolvedValue([{ id: "1", word: "造語" }]);
    const mode: EditorMode = {
      type: "standalone",
      fileName: "a.txt",
      filePath: "/abs/a.txt",
    } as EditorMode;
    const terms = await collectKnownTerms({ editorMode: mode });
    expect(loadEntriesStandalone).toHaveBeenCalledWith("/abs/a.txt");
    expect(terms.has("造語")).toBe(true);
  });

  it("user-dictionary source falls back to fileName when filePath is absent", async () => {
    loadEntriesStandalone.mockResolvedValue([]);
    const mode: EditorMode = {
      type: "standalone",
      fileName: "a.txt",
    } as EditorMode;
    await collectKnownTerms({ editorMode: mode });
    expect(loadEntriesStandalone).toHaveBeenCalledWith("a.txt");
  });
});
