import { describe, it, expect } from "vitest";
import type { GenjiHealth } from "@/lib/dict/dict-access";

import { createRulesetContext, resolveRulesetContext } from "../ruleset-context-factory";

const fakeDict = {
  async lookupBatch() {
    return new Map();
  },
  async has() {
    return false;
  },
};

describe("createRulesetContext", () => {
  it("wires bases, toolkit, and engineApi", () => {
    const ctx = createRulesetContext({ dictHealth: { state: "ready" }, dict: fakeDict });
    expect(ctx.engineApi).toBe(1);
    expect(typeof ctx.bases.AbstractL1Rule).toBe("function");
    expect(typeof ctx.toolkit.regexReplace).toBe("function");
    expect(ctx.toolkit.nfkc("ﾄﾞ")).toBe("ド");
  });

  it("derives dict requirement satisfaction from health (ready)", () => {
    const ctx = createRulesetContext({ dictHealth: { state: "ready" }, dict: fakeDict });
    expect(ctx.deps.dictState).toBe("ready");
    expect(ctx.deps.requirements.get("dict:genji")).toBe(true);
    expect(ctx.toolkit.dict.ready).toBe(true);
  });

  it.each(["not-installed", "corrupt", "unknown"] as const)(
    "marks dict requirement unmet when health is %s",
    (state) => {
      const ctx = createRulesetContext({ dictHealth: { state } as GenjiHealth, dict: fakeDict });
      expect(ctx.deps.dictState).toBe(state);
      expect(ctx.deps.requirements.get("dict:genji")).toBe(false);
      expect(ctx.toolkit.dict.ready).toBe(false);
    },
  );

  it("honors an explicit requirements override", () => {
    const ctx = createRulesetContext({
      dictHealth: { state: "not-installed" },
      dict: fakeDict,
      requirements: new Map([["dict:genji", true]]),
    });
    expect(ctx.deps.requirements.get("dict:genji")).toBe(true);
  });
});

describe("resolveRulesetContext", () => {
  it("builds a context from the live dictionary singleton (not-installed in node)", async () => {
    const ctx = await resolveRulesetContext();
    expect(ctx.engineApi).toBe(1);
    expect(typeof ctx.deps.dictState).toBe("string");
    // No window in the test env → dictionary is not "ready".
    expect(ctx.deps.requirements.get("dict:genji")).toBe(false);
  });
});
