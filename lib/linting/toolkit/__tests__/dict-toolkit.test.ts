import { describe, it, expect, vi } from "vitest";

import { createDictToolkit } from "../dict-toolkit";
import type { GenjiHealth } from "@/lib/dict/dict-access";

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

  it.each(["not-installed", "web-fallback", "corrupt", "unknown"] as const)(
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
});
