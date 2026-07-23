import { beforeEach, describe, expect, it } from "vitest";

import { localPreferences } from "../local-preferences";

describe("PDF preview local preference", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to automatic selection", () => {
    expect(localPreferences.getPdfPreviewMaxPages()).toBe("auto");
  });

  it.each(["auto", "32", "100", "200", "300", "500"] as const)(
    "persists the supported value %s",
    (value) => {
      localPreferences.setPdfPreviewMaxPages(value);
      expect(localPreferences.getPdfPreviewMaxPages()).toBe(value);
    },
  );

  it("falls back safely when storage contains an unknown value", () => {
    localStorage.setItem("illusions:pdf-preview-max-pages", "9999");
    expect(localPreferences.getPdfPreviewMaxPages()).toBe("auto");
  });
});
