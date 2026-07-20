/**
 * Tests for loadRuleSourceMap — the ruleId → 出典(ruleset) mapping that lets the
 * inspector correction panel group detection results by source instead of
 * collapsing everything into "その他" (内蔵ルールゼロ化後の退行修正)。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// isElectronRenderer is mocked so the pure loader runs outside Electron.
vi.mock("@/lib/utils/runtime-env", () => ({
  isElectronRenderer: () => true,
}));

import { loadRuleSourceMap } from "../use-rule-source-map";

interface FakeRulesetsApi {
  listInstalled: ReturnType<typeof vi.fn>;
  readModule: ReturnType<typeof vi.fn>;
}

function setRulesetsApi(api: FakeRulesetsApi | undefined): void {
  (window as unknown as { electronAPI?: { rulesets?: FakeRulesetsApi } }).electronAPI = api
    ? { rulesets: api }
    : undefined;
}

afterEach(() => {
  setRulesetsApi(undefined);
  vi.restoreAllMocks();
});

describe("loadRuleSourceMap", () => {
  beforeEach(() => setRulesetsApi(undefined));

  it("returns an empty map when the rulesets API is unavailable", async () => {
    expect((await loadRuleSourceMap()).size).toBe(0);
  });

  it("maps every ruleId to its owning ruleset (id + nameJa)", async () => {
    setRulesetsApi({
      listInstalled: vi.fn(async () => [
        { id: "pack-a", version: "1.0.0", tag: null },
        { id: "pack-b", version: "1.0.0", tag: null },
      ]),
      readModule: vi.fn(async (id: string) =>
        id === "pack-a"
          ? {
              ok: true,
              id,
              tag: null,
              code: "",
              manifest: {
                id: "pack-a",
                nameJa: "文化庁ルール",
                rules: [{ ruleId: "a-1" }, { ruleId: "a-2" }],
              },
            }
          : {
              ok: true,
              id,
              tag: null,
              code: "",
              manifest: { id: "pack-b", nameJa: "JIS ルール", rules: [{ ruleId: "b-1" }] },
            },
      ),
    });

    const map = await loadRuleSourceMap();
    expect(map.get("a-1")).toEqual({ id: "pack-a", nameJa: "文化庁ルール" });
    expect(map.get("a-2")).toEqual({ id: "pack-a", nameJa: "文化庁ルール" });
    expect(map.get("b-1")).toEqual({ id: "pack-b", nameJa: "JIS ルール" });
  });

  it("falls back to name/id when nameJa is missing and keeps first ruleId on collision", async () => {
    setRulesetsApi({
      listInstalled: vi.fn(async () => [
        { id: "pack-a", version: "1.0.0", tag: null },
        { id: "pack-b", version: "1.0.0", tag: null },
      ]),
      readModule: vi.fn(async (id: string) =>
        id === "pack-a"
          ? {
              ok: true,
              id,
              tag: null,
              code: "",
              manifest: { id: "pack-a", name: "Pack A", rules: [{ ruleId: "dup" }] },
            }
          : {
              ok: true,
              id,
              tag: null,
              code: "",
              // No nameJa nor name → falls back to the installed id.
              manifest: { rules: [{ ruleId: "dup" }] },
            },
      ),
    });

    const map = await loadRuleSourceMap();
    // name fallback for pack-a; first-wins keeps "dup" pointing at pack-a.
    expect(map.get("dup")).toEqual({ id: "pack-a", nameJa: "Pack A" });
  });

  it("skips rulesets that failed to load and rules without a string ruleId", async () => {
    setRulesetsApi({
      listInstalled: vi.fn(async () => [
        { id: "ok", version: "1.0.0", tag: null },
        { id: "bad", version: "1.0.0", tag: null },
      ]),
      readModule: vi.fn(async (id: string) =>
        id === "ok"
          ? {
              ok: true,
              id,
              tag: null,
              code: "",
              manifest: {
                id: "ok",
                nameJa: "OK 出典",
                rules: [{ ruleId: "ok-1" }, {} /* malformed: no ruleId */],
              },
            }
          : { ok: false, id, reason: "verification failed" },
      ),
    });

    const map = await loadRuleSourceMap();
    expect([...map.keys()]).toEqual(["ok-1"]);
  });

  it("returns an empty map (never throws) when the API rejects", async () => {
    setRulesetsApi({
      listInstalled: vi.fn(async () => {
        throw new Error("ipc boom");
      }),
      readModule: vi.fn(),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await loadRuleSourceMap()).size).toBe(0);
  });
});
