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
import type { Token } from "@/lib/nlp-client/types";
import { createSnapshotDictToolkit } from "@/lib/linting/toolkit";
import { collectDictCandidateTerms } from "@/lib/linting/dict-candidate-terms";

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

  it("preserves projection fields on entries it does not override", () => {
    const map = new Map<string, DictLookup>([
      ["猫", { found: true, freqRank: 10 } as DictLookup],
      ["造語", { found: false }],
    ]);
    applyKnownTermsToSnapshot(map, ["猫", "造語"], new Set(["造語"]));
    expect(map.get("猫")).toEqual({ found: true, freqRank: 10 });
  });
});

/**
 * End-to-end contract: the override must be visible through the exact surface the
 * out-of-dict rule reads — `createSnapshotDictToolkit().lookupCached`. The rule
 * flags a term only when lookupCached returns `{ found: false }`, so a known term
 * appearing as `{ found: true }` here proves it will NOT be flagged.
 */
describe("known terms suppress out-of-dict via the snapshot toolkit", () => {
  it("a known miss reads back as found:true; an unknown miss stays found:false", () => {
    // Genji reported both as absent...
    const map = new Map<string, DictLookup>([
      ["造語", { found: false }],
      ["誤変換", { found: false }],
    ]);
    // ...but the user registered 「造語」.
    applyKnownTermsToSnapshot(map, map.keys(), new Set(["造語"]));

    const dict = createSnapshotDictToolkit();
    dict.setSnapshot([...map.entries()], true);

    // 造語 → not flagged (rule skips found:true); 誤変換 → still flagged.
    expect(dict.lookupCached("造語")).toEqual({ found: true });
    expect(dict.lookupCached("誤変換")).toEqual({ found: false });
  });

  it("suppresses a conjugated verb when its basic form is a known term", () => {
    // The rule queries the basic form (dictCandidateTerm), so the user must
    // register the basic form 「走る」, not the surface 「走っ」.
    const token = {
      surface: "走っ",
      pos: "動詞",
      pos_detail_1: "自立",
      basic_form: "走る",
    } as unknown as Token;
    const terms = collectDictCandidateTerms([token]);
    expect(terms).toContain("走る");

    const map = new Map<string, DictLookup>(terms.map((t) => [t, { found: false } as DictLookup]));
    applyKnownTermsToSnapshot(map, terms, new Set(["走る"]));

    const dict = createSnapshotDictToolkit();
    dict.setSnapshot([...map.entries()], true);
    expect(dict.lookupCached("走る")).toEqual({ found: true });
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
