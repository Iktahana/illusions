import { describe, it, expect, vi } from "vitest";

import { createDictToolkit, createSnapshotDictToolkit } from "../dict-toolkit";
import type { GenjiHealth } from "@/lib/dict/dict-access";
import type { Token } from "@/lib/nlp-client/types";

function tok(partial: Partial<Token> & { surface: string; pos: string }): Token {
  return {
    pos_detail_1: undefined,
    pos_detail_2: undefined,
    pos_detail_3: undefined,
    basic_form: partial.surface,
    reading: undefined,
    start: 0,
    end: partial.surface.length,
    ...partial,
  } as Token;
}

function spyDict() {
  return {
    lookupBatch: vi.fn(async (terms: string[]) => new Map(terms.map((t) => [t, { found: true }]))),
    has: vi.fn(async () => true),
  };
}

describe("createDictToolkit", () => {
  it("delegates when the dictionary is ready", async () => {
    const dict = spyDict();
    const tk = createDictToolkit({ state: "ready" } as GenjiHealth, dict);
    expect(tk.ready).toBe(true);
    expect(tk.state).toBe("ready");
    expect(await tk.has("猫")).toBe(true);
    const map = await tk.lookupBatch(["猫"]);
    expect(map.get("猫")?.found).toBe(true);
    expect(dict.lookupBatch).toHaveBeenCalledOnce();
  });

  it.each(["not-installed", "corrupt", "unknown"] as const)(
    "fails safe (empty results, no calls) when state is %s",
    async (state) => {
      const dict = spyDict();
      const tk = createDictToolkit({ state } as GenjiHealth, dict);
      expect(tk.ready).toBe(false);
      expect(await tk.has("猫")).toBe(false);
      expect((await tk.lookupBatch(["猫"])).size).toBe(0);
      expect(dict.lookupBatch).not.toHaveBeenCalled();
      expect(dict.has).not.toHaveBeenCalled();
    },
  );

  it("never reports cached membership (no prewarm snapshot)", () => {
    const tk = createDictToolkit({ state: "ready" } as GenjiHealth, spyDict());
    expect(tk.hasCached("猫")).toBe(false);
    expect(tk.lookupCached("猫")).toBeUndefined();
  });
});

describe("candidateTerm / candidateTerms (Tier 0, #1935)", () => {
  // Host-owned headword selection so rulesets need not vendor a private copy.
  it.each([
    createDictToolkit({ state: "ready" } as GenjiHealth, spyDict()),
    createSnapshotDictToolkit(),
  ])("exposes the host headword selection on every toolkit variant", (tk) => {
    // 名詞 → surface; 動詞 → basic_form; auxiliary/ascii → null.
    expect(tk.candidateTerm(tok({ surface: "辞書", pos: "名詞", pos_detail_1: "一般" }))).toBe(
      "辞書",
    );
    expect(
      tk.candidateTerm(
        tok({ surface: "走っ", pos: "動詞", pos_detail_1: "自立", basic_form: "走る" }),
      ),
    ).toBe("走る");
    expect(tk.candidateTerm(tok({ surface: "を", pos: "助詞" }))).toBeNull();

    const terms = tk.candidateTerms([
      tok({ surface: "猫", pos: "名詞", pos_detail_1: "一般" }),
      tok({ surface: "が", pos: "助詞" }),
      tok({ surface: "走っ", pos: "動詞", pos_detail_1: "自立", basic_form: "走る" }),
    ]);
    expect(terms.sort()).toEqual(["猫", "走る"].sort());
  });
});

describe("createSnapshotDictToolkit", () => {
  it("starts not-ready with an empty snapshot", () => {
    const tk = createSnapshotDictToolkit();
    expect(tk.ready).toBe(false);
    expect(tk.state).toBe("unknown");
    expect(tk.hasCached("猫")).toBe(false);
    expect(tk.lookupCached("猫")).toBeUndefined();
  });

  it("reads installed snapshot membership synchronously when ready", () => {
    const tk = createSnapshotDictToolkit();
    tk.setSnapshot(
      [
        ["猫", { found: true, reading: "ネコ" }],
        ["みゃお", { found: false }],
      ],
      true,
    );
    expect(tk.ready).toBe(true);
    expect(tk.state).toBe("ready");
    // Present headword.
    expect(tk.hasCached("猫")).toBe(true);
    expect(tk.lookupCached("猫")).toEqual({ found: true, reading: "ネコ" });
    // Prewarmed-but-absent headword: distinguishable from "not prewarmed".
    expect(tk.hasCached("みゃお")).toBe(false);
    expect(tk.lookupCached("みゃお")).toEqual({ found: false });
    // Not prewarmed at all → undefined (rule must skip, never flag).
    expect(tk.lookupCached("未照合")).toBeUndefined();
  });

  it("treats a not-ready snapshot as no prewarm (rules no-op)", () => {
    const tk = createSnapshotDictToolkit();
    // ready=false even though entries are present (dict not installed).
    tk.setSnapshot([["猫", { found: true }]], false);
    expect(tk.ready).toBe(false);
    expect(tk.hasCached("猫")).toBe(false);
    expect(tk.lookupCached("猫")).toBeUndefined();
  });

  it("clearSnapshot returns to the not-prewarmed state", () => {
    const tk = createSnapshotDictToolkit();
    tk.setSnapshot([["猫", { found: true }]], true);
    tk.clearSnapshot();
    expect(tk.ready).toBe(false);
    expect(tk.hasCached("猫")).toBe(false);
    expect(tk.lookupCached("猫")).toBeUndefined();
  });

  it("replaces the snapshot per batch (no stale carryover)", () => {
    const tk = createSnapshotDictToolkit();
    tk.setSnapshot([["猫", { found: true }]], true);
    expect(tk.lookupCached("猫")).toEqual({ found: true });
    // Next batch covers different terms; the old term is no longer prewarmed.
    tk.setSnapshot([["犬", { found: true }]], true);
    expect(tk.lookupCached("犬")).toEqual({ found: true });
    expect(tk.lookupCached("猫")).toBeUndefined();
  });

  it("has no live async dictionary connection (always empty)", async () => {
    const tk = createSnapshotDictToolkit();
    tk.setSnapshot([["猫", { found: true }]], true);
    expect(await tk.has("猫")).toBe(false);
    expect((await tk.lookupBatch(["猫"])).size).toBe(0);
  });
});
