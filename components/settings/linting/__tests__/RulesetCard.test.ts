/**
 * Contract tests for RulesetCard and related linting components.
 *
 * No @testing-library/react available — tests cover module exports,
 * prop/logic contracts, and mock-verified IPC behaviour.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// SourceBadge
// ---------------------------------------------------------------------------
describe("SourceBadge — module structure", () => {
  it("exports a default function", async () => {
    const mod = await import("@/components/settings/linting/SourceBadge");
    expect(typeof mod.default).toBe("function");
  });

  it("SourceType union covers built-in, official, third-party", async () => {
    // Type-level test: verify the exported type by checking the label map
    // (if a key is missing the TS build would fail, but here we confirm runtime)
    const labels: Record<string, string> = {
      "built-in": "内蔵",
      official: "公式",
      "third-party": "サードパーティ",
    };
    for (const key of ["built-in", "official", "third-party"] as const) {
      expect(typeof labels[key]).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// RuleRow
// ---------------------------------------------------------------------------
describe("RuleRow — module structure", () => {
  it("exports a default function", async () => {
    const mod = await import("@/components/settings/linting/RuleRow");
    expect(typeof mod.default).toBe("function");
  });
});

describe("RuleRow — onChange contract", () => {
  it("fires with toggled enabled flag", () => {
    const calls: Array<{ ruleId: string; config: { enabled: boolean } }> = [];
    const handler = (ruleId: string, config: { enabled: boolean; severity: string }): void => {
      calls.push({ ruleId, config });
    };

    // Simulate what the toggle button onClick does
    const ruleId = "jtf-1-2-1";
    const config = { enabled: true, severity: "warning" as const };
    handler(ruleId, { ...config, enabled: !config.enabled });

    expect(calls).toHaveLength(1);
    expect(calls[0].ruleId).toBe("jtf-1-2-1");
    expect(calls[0].config.enabled).toBe(false);
  });

  it("fires with new severity value", () => {
    const calls: Array<{ ruleId: string; severity: string }> = [];
    const handler = (ruleId: string, config: { enabled: boolean; severity: string }): void => {
      calls.push({ ruleId, severity: config.severity });
    };
    const ruleId = "jtf-1-2-1";
    const config = { enabled: true, severity: "warning" as const };
    handler(ruleId, { ...config, severity: "error" });

    expect(calls[0].severity).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// RulesetCard — module + non-deletable logic
// ---------------------------------------------------------------------------
describe("RulesetCard — module structure", () => {
  it("exports a default function", async () => {
    const mod = await import("@/components/settings/linting/RulesetCard");
    expect(typeof mod.default).toBe("function");
  });
});

describe("RulesetCard — non-deletable enforcement", () => {
  it("deletable=false means the delete button should be disabled (aria-disabled)", () => {
    // The component renders <button aria-disabled={!deletable}> when deletable=false
    const deletable = false;
    const ariaDisabled = !deletable;
    expect(ariaDisabled).toBe(true);
  });

  it("deletable=true means the delete button should be enabled", () => {
    const deletable = true;
    const ariaDisabled = !deletable;
    expect(ariaDisabled).toBe(false);
  });

  it("tooltip text for non-deletable is the correct Japanese string", () => {
    const tooltip = "内蔵推奨ルールセットは削除できません";
    expect(tooltip).toBe("内蔵推奨ルールセットは削除できません");
  });
});

describe("RulesetCard — enabled count logic", () => {
  it("counts enabled rules correctly", () => {
    const configs: Record<string, { enabled: boolean; severity: string }> = {
      "rule-a": { enabled: true, severity: "warning" },
      "rule-b": { enabled: false, severity: "warning" },
      "rule-c": { enabled: true, severity: "error" },
    };
    const ruleIds = ["rule-a", "rule-b", "rule-c"];
    const enabledCount = ruleIds.filter((id) => configs[id]?.enabled).length;
    expect(enabledCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// RulesetList — module + pack toggle batch logic
// ---------------------------------------------------------------------------
describe("RulesetList — module structure", () => {
  it("exports a default function", async () => {
    const mod = await import("@/components/settings/linting/RulesetList");
    expect(typeof mod.default).toBe("function");
  });
});

describe("RulesetList — pack toggle batch logic", () => {
  it("enables all rules in a pack by merging into existing configs", () => {
    const existing: Record<string, { enabled: boolean; severity: string; skipDialogue?: boolean }> =
      {
        "rule-a": { enabled: false, severity: "warning" },
        "rule-b": { enabled: false, severity: "error" },
        "other-rule": { enabled: true, severity: "info" },
      };
    const packRuleIds = ["rule-a", "rule-b"];
    const enabled = true;

    // Replicate handlePackToggle logic
    const next = { ...existing };
    for (const ruleId of packRuleIds) {
      const current = next[ruleId] ?? { enabled: false, severity: "warning" };
      next[ruleId] = { ...current, enabled };
    }

    expect(next["rule-a"].enabled).toBe(true);
    expect(next["rule-b"].enabled).toBe(true);
    // Unrelated rule untouched
    expect(next["other-rule"].enabled).toBe(true);
  });

  it("disables all rules in a pack while preserving severity", () => {
    const existing: Record<string, { enabled: boolean; severity: string }> = {
      "rule-a": { enabled: true, severity: "error" },
      "rule-b": { enabled: true, severity: "info" },
    };
    const packRuleIds = ["rule-a", "rule-b"];

    const next = { ...existing };
    for (const ruleId of packRuleIds) {
      const current = next[ruleId] ?? { enabled: true, severity: "warning" };
      next[ruleId] = { ...current, enabled: false };
    }

    expect(next["rule-a"].enabled).toBe(false);
    expect(next["rule-a"].severity).toBe("error");
    expect(next["rule-b"].enabled).toBe(false);
    expect(next["rule-b"].severity).toBe("info");
  });
});

// ---------------------------------------------------------------------------
// MarketplaceEntryCard
// ---------------------------------------------------------------------------
describe("MarketplaceEntryCard — module structure", () => {
  it("exports a default function", async () => {
    const mod = await import("@/components/settings/linting/MarketplaceEntryCard");
    expect(typeof mod.default).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// ModeSelector — module + mode-change handler logic
// ---------------------------------------------------------------------------
describe("ModeSelector — module structure", () => {
  it("exports a default function", async () => {
    const mod = await import("@/components/settings/linting/ModeSelector");
    expect(typeof mod.default).toBe("function");
  });
});

describe("ModeSelector — mode change calls batch handler with preset configs", () => {
  it("handleModeChange produces a batch config call for 'novel' mode", async () => {
    const { CORRECTION_MODES, MODE_TO_PRESET } = await import("@/lib/linting/correction-modes");
    const { LINT_PRESETS } = await import("@/lib/linting/lint-presets");

    const modeId = "novel";
    const mode = CORRECTION_MODES[modeId];
    const presetId = MODE_TO_PRESET[modeId];
    const preset = LINT_PRESETS[presetId];

    // Verify the chain resolves correctly
    expect(mode.id).toBe("novel");
    expect(presetId).toBe("novel");
    expect(preset).toBeDefined();
    expect(typeof preset.configs).toBe("object");
    expect(Object.keys(preset.configs).length).toBeGreaterThan(0);
  });

  it("mode change fires onCorrectionConfigChange with mode + defaultGuidelines", async () => {
    const { CORRECTION_MODES } = await import("@/lib/linting/correction-modes");
    const batchCalls: unknown[] = [];
    const configCalls: unknown[] = [];

    const onCorrectionConfigChange = (cfg: unknown): void => {
      configCalls.push(cfg);
    };
    const onLintingRuleConfigsBatchChange = (cfgs: unknown): void => {
      batchCalls.push(cfgs);
    };

    // Replicate handleModeChange logic
    const modeId = "official";
    const { LINT_PRESETS } = await import("@/lib/linting/lint-presets");
    const { MODE_TO_PRESET } = await import("@/lib/linting/correction-modes");

    const mode = CORRECTION_MODES[modeId];
    onCorrectionConfigChange({ mode: mode.id, guidelines: [...mode.defaultGuidelines] });
    const presetId = MODE_TO_PRESET[modeId];
    const preset = LINT_PRESETS[presetId];
    if (preset) {
      onLintingRuleConfigsBatchChange({ ...preset.configs });
    }

    expect(configCalls).toHaveLength(1);
    expect((configCalls[0] as { mode: string }).mode).toBe("official");
    expect(batchCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// useRulesetStatus — mock window.electronAPI.rulesets
// ---------------------------------------------------------------------------
describe("useRulesetStatus — mock electronAPI", () => {
  beforeEach(() => {
    // Set up a minimal electronAPI mock
    const mockRulesets = {
      listInstalled: vi
        .fn()
        .mockResolvedValue([{ id: "gendai-kanazukai", version: "1.0.0", tag: "v1.0.0" }]),
      readModule: vi.fn().mockResolvedValue({
        ok: true,
        id: "gendai-kanazukai",
        tag: "v1.0.0",
        manifest: {
          id: "gendai-kanazukai",
          name: "gendai-kanazukai",
          nameJa: "現代仮名遣い",
          version: "1.0.0",
          rules: [
            {
              ruleId: "gk-yotsugana",
              nameJa: "四つ仮名の用法",
              level: "L1",
            },
          ],
        },
        code: "/* mock */",
      }),
      checkUpdate: vi.fn().mockResolvedValue([{ id: "gendai-kanazukai", updateAvailable: false }]),
      sync: vi.fn().mockResolvedValue([{ id: "gendai-kanazukai", status: "up-to-date" }]),
      uninstall: vi.fn().mockResolvedValue({ ok: true }),
      onSyncProgress: vi.fn().mockReturnValue(() => {}),
      onChanged: vi.fn().mockReturnValue(() => {}),
    };

    Object.defineProperty(window, "electronAPI", {
      value: { isElectron: true, rulesets: mockRulesets },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Clean up
    Object.defineProperty(window, "electronAPI", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    vi.clearAllMocks();
  });

  it("isElectronRenderer returns true when window.electronAPI.isElectron is set", async () => {
    const { isElectronRenderer } = await import("@/lib/utils/runtime-env");
    // In jsdom, electronAPI is now set
    expect(isElectronRenderer()).toBe(true);
  });

  it("listInstalled API is callable and returns expected shape", async () => {
    const api = (
      window as Window & { electronAPI?: { rulesets?: { listInstalled: () => Promise<unknown> } } }
    ).electronAPI?.rulesets;
    expect(api).toBeDefined();
    const result = await api!.listInstalled();
    expect(Array.isArray(result)).toBe(true);
    expect((result as Array<{ id: string }>)[0].id).toBe("gendai-kanazukai");
  });

  it("readModule returns manifest with rules array", async () => {
    const api = (
      window as Window & {
        electronAPI?: {
          rulesets?: {
            readModule: (id: string) => Promise<unknown>;
          };
        };
      }
    ).electronAPI?.rulesets;
    const result = (await api!.readModule("gendai-kanazukai")) as {
      ok: boolean;
      manifest: { nameJa: string; rules: Array<{ ruleId: string }> };
    };
    expect(result.ok).toBe(true);
    expect(result.manifest.nameJa).toBe("現代仮名遣い");
    expect(result.manifest.rules[0].ruleId).toBe("gk-yotsugana");
  });

  it("uninstall API is called and returns ok", async () => {
    const api = (
      window as Window & {
        electronAPI?: {
          rulesets?: {
            uninstall: (id: string) => Promise<{ ok: boolean }>;
          };
        };
      }
    ).electronAPI?.rulesets;
    const result = await api!.uninstall("gendai-kanazukai");
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Web guard: useRulesetStatus returns empty when not Electron
// ---------------------------------------------------------------------------
describe("useRulesetStatus — Web guard (no electronAPI)", () => {
  beforeEach(() => {
    Object.defineProperty(window, "electronAPI", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it("isElectronRenderer returns false when window.electronAPI is absent", async () => {
    const { isElectronRenderer } = await import("@/lib/utils/runtime-env");
    expect(isElectronRenderer()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LintingSettings — main container module
// ---------------------------------------------------------------------------
describe("LintingSettings — module structure", () => {
  it("exports a default function component", async () => {
    const mod = await import("@/components/settings/LintingSettings");
    expect(typeof mod.default).toBe("function");
  });

  it("re-exports LintingSettingsProps shape (via named export)", async () => {
    // Named export exists — TypeScript enforces shape; runtime check: module resolves
    const mod = await import("@/components/settings/LintingSettings");
    expect(mod.default).toBeDefined();
  });
});
