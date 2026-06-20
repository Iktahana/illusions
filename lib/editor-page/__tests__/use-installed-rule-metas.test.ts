/**
 * Tests for loadInstalledRuleMetas — the rule-meta source feeding the inspector
 * correction-mode dropdown (#1817 left the inspector path unwired).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { buildModeRuleConfigsFromRules } from "@/lib/linting/mode-rule-configs";

// isElectronRenderer is mocked so the pure loader runs outside Electron.
vi.mock("@/lib/utils/runtime-env", () => ({
  isElectronRenderer: () => true,
}));

import { loadInstalledRuleMetas } from "../use-installed-rule-metas";

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

describe("loadInstalledRuleMetas", () => {
  beforeEach(() => setRulesetsApi(undefined));

  it("returns [] when the rulesets API is unavailable", async () => {
    expect(await loadInstalledRuleMetas()).toEqual([]);
  });

  it("flattens rules across all installed rulesets and keeps mode metadata", async () => {
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
                rules: [
                  { ruleId: "a-1", applicableModes: ["novel"], defaultConfig: { severity: "error" } },
                  { ruleId: "a-2", applicableModes: ["official"] },
                ],
              },
            }
          : {
              ok: true,
              id,
              tag: null,
              code: "",
              manifest: { rules: [{ ruleId: "b-1", applicableModes: ["novel", "official"] }] },
            },
      ),
    });

    const metas = await loadInstalledRuleMetas();
    expect(metas.map((m) => m.ruleId).sort()).toEqual(["a-1", "a-2", "b-1"]);

    // The metas must drive buildModeRuleConfigsFromRules correctly (the actual fix).
    const novel = buildModeRuleConfigsFromRules("novel", metas);
    expect(novel["a-1"].enabled).toBe(true);
    expect(novel["a-1"].severity).toBe("error");
    expect(novel["a-2"].enabled).toBe(false);
    expect(novel["b-1"].enabled).toBe(true);
    // Complete map: switching to a mode disables non-member rules, not drops them.
    expect(Object.keys(novel).sort()).toEqual(["a-1", "a-2", "b-1"]);
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
                rules: [
                  { ruleId: "ok-1", applicableModes: ["novel"] },
                  { applicableModes: ["novel"] }, // malformed: no ruleId
                ],
              },
            }
          : { ok: false, id, reason: "verification failed" },
      ),
    });

    const metas = await loadInstalledRuleMetas();
    expect(metas.map((m) => m.ruleId)).toEqual(["ok-1"]);
  });

  it("returns [] (never throws) when the API rejects", async () => {
    setRulesetsApi({
      listInstalled: vi.fn(async () => {
        throw new Error("ipc boom");
      }),
      readModule: vi.fn(),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadInstalledRuleMetas()).toEqual([]);
  });
});
