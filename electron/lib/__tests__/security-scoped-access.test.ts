import { describe, expect, it, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { startSecurityScopedAccess, stopSecurityScopedAccess } =
  require("../security-scoped-access.js") as {
    startSecurityScopedAccess: (
      electronApp: { startAccessingSecurityScopedResource?: (bookmark: string) => unknown } | null,
      bookmark?: string,
    ) => (() => void) | undefined;
    stopSecurityScopedAccess: (rootEntry?: { stopAccessing?: () => void }) => void;
  };

describe("security-scoped access helpers", () => {
  it("is harmless when the Electron API is unavailable", () => {
    expect(startSecurityScopedAccess({}, "bookmark-base64")).toBeUndefined();
    expect(startSecurityScopedAccess(null, "bookmark-base64")).toBeUndefined();
  });

  it("is harmless when no bookmark is present", () => {
    const electronApp = {
      startAccessingSecurityScopedResource: vi.fn(),
    };

    expect(startSecurityScopedAccess(electronApp, undefined)).toBeUndefined();
    expect(electronApp.startAccessingSecurityScopedResource).not.toHaveBeenCalled();
  });

  it("returns the stop function from Electron for a bookmark", () => {
    const stop = vi.fn();
    const electronApp = {
      startAccessingSecurityScopedResource: vi.fn(() => stop),
    };

    expect(startSecurityScopedAccess(electronApp, "bookmark-base64")).toBe(stop);
    expect(electronApp.startAccessingSecurityScopedResource).toHaveBeenCalledWith(
      "bookmark-base64",
    );
  });

  it("stops once and clears the stored stop function", () => {
    const stop = vi.fn();
    const rootEntry = { stopAccessing: stop };

    stopSecurityScopedAccess(rootEntry);
    stopSecurityScopedAccess(rootEntry);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(rootEntry.stopAccessing).toBeUndefined();
  });
});
