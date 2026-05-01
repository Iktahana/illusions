/**
 * Contract tests for the settings navigation configuration.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/utils/runtime-env", () => ({
  isElectronRenderer: () => true,
}));

const { buildSettingsNavConfig } = await import("../nav-config");

describe("buildSettingsNavConfig — structure", () => {
  it("returns seven labelled groups", () => {
    const groups = buildSettingsNavConfig();
    expect(groups).toHaveLength(7);
    expect(groups.map((g) => g.label)).toEqual([
      "AI/LLM",
      "アカウント",
      "校正と文体・辞書",
      "エディタと表示",
      "入出力",
      "システム",
      "ヘルプ",
    ]);
  });

  it("marks top of features section and help with separators", () => {
    const groups = buildSettingsNavConfig();
    const separated = groups.filter((g) => g.separator).map((g) => g.label);
    expect(separated).toEqual(["校正と文体・辞書", "ヘルプ"]);
  });

  it("places terminal inside エディタと表示 (not 入出力)", () => {
    const groups = buildSettingsNavConfig();
    const editor = groups.find((g) => g.label === "エディタと表示");
    const io = groups.find((g) => g.label === "入出力");
    expect(editor?.items.map((i) => i.id)).toContain("terminal");
    expect(io?.items.map((i) => i.id)).not.toContain("terminal");
  });

  it("all items have ids and labels", () => {
    const groups = buildSettingsNavConfig();
    for (const group of groups) {
      for (const item of group.items) {
        expect(typeof item.id).toBe("string");
        expect(item.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("covers the expected category set without duplicates", () => {
    const groups = buildSettingsNavConfig();
    const ids = groups.flatMap((g) => g.items.map((i) => i.id));
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        "account",
        "ai-connection",
        "linting",
        "dictionary",
        "typography",
        "scroll",
        "pos-highlight",
        "keymap",
        "speech",
        "terminal",
        "power",
        "about",
      ]),
    );
  });
});
