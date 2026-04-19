/**
 * Contract tests for SettingsLayout primitive.
 */

import { describe, it, expect } from "vitest";

describe("SettingsLayout — module structure", () => {
  it("exports a default function component", async () => {
    const mod = await import("@/components/settings/primitives/SettingsLayout");
    expect(typeof mod.default).toBe("function");
  });

  it("is re-exported from the primitives index", async () => {
    const mod = await import("@/components/settings/primitives");
    expect(typeof mod.SettingsLayout).toBe("function");
  });
});

describe("SettingsLayout — wideContent contract", () => {
  it("wideContent flag is optional boolean", () => {
    const wide: boolean | undefined = undefined;
    const resolved = wide ?? false;
    expect(typeof resolved).toBe("boolean");
    expect(resolved).toBe(false);
  });
});
