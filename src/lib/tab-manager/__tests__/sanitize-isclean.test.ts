import { describe, it, expect } from "vitest";
import { sanitizeMdiContent } from "@/lib/tab-manager/types";

describe("sanitizeMdiContent — history restore isClean parity", () => {
  it("(.mdi) restored content with <br /> matches saved [[blank]]", () => {
    // After save: <br /> → [[blank]] is on disk.
    const saved = "A\n\n[[blank]]\n\nB";
    // Restored from snapshot: could be either form depending on snapshot age.
    const restored = "A\n\n<br />\n\nB";
    expect(sanitizeMdiContent(restored, { fileType: ".mdi" })).toBe(
      sanitizeMdiContent(saved, { fileType: ".mdi" }),
    );
  });
  it("(.md) restored content with <br /> matches saved \\n", () => {
    // When an .md file containing "A\n\n<br />\n\nB" is saved, the <br /> is
    // converted to \n by Step 1b, producing "A\n\n\n\n\nB" on disk.
    const saved = "A\n\n\n\n\nB";
    const restored = "A\n\n<br />\n\nB";
    expect(sanitizeMdiContent(restored, { fileType: ".md" })).toBe(
      sanitizeMdiContent(saved, { fileType: ".md" }),
    );
  });
});
