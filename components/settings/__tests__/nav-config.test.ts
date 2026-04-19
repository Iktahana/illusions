/**
 * Contract tests for the settings navigation configuration.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/utils/runtime-env", () => ({
  isElectronRenderer: () => true,
}));

const { buildSettingsNavConfig } = await import("../nav-config");

describe("buildSettingsNavConfig — structure", () => {
  it("returns six labelled groups", () => {
    const groups = buildSettingsNavConfig();
    expect(groups).toHaveLength(6);
    expect(groups.map((g) => g.label)).toEqual([
      "アカウント",
      "AI とオンライン機能",
      "エディタと表示",
      "入出力",
      "システム",
      "ヘルプ",
    ]);
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
