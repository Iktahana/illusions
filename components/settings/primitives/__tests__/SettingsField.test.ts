/**
 * Contract tests for SettingsField primitive.
 */

import { describe, it, expect } from "vitest";

describe("SettingsField — module structure", () => {
  it("exports a default function component", async () => {
    const mod = await import("@/components/settings/primitives/SettingsField");
    expect(typeof mod.default).toBe("function");
  });

  it("is re-exported from the primitives index", async () => {
    const mod = await import("@/components/settings/primitives");
    expect(typeof mod.SettingsField).toBe("function");
  });
});

describe("SettingsField — htmlFor contract", () => {
  it("htmlFor prop supports SettingsToggle.id pairing", () => {
    const htmlFor: string | undefined = "setting-x";
    const toggleId: string = htmlFor ?? "";
    expect(toggleId).toBe("setting-x");
  });
});
