import { describe, expect, it } from "vitest";

import { getLayoutCharsPerLine } from "../chars-per-line-layout";

describe("getLayoutCharsPerLine", () => {
  it("keeps horizontal layout at the configured character count", () => {
    expect(getLayoutCharsPerLine(40, false)).toBe(40);
  });

  it("uses one fewer character for vertical layout to avoid flush bottom clipping", () => {
    expect(getLayoutCharsPerLine(40, true)).toBe(39);
  });

  it("does not reduce vertical layout below one character", () => {
    expect(getLayoutCharsPerLine(1, true)).toBe(1);
  });
});
