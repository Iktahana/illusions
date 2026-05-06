import { describe, it, expect } from "vitest";
import { sanitizeMdiContent } from "@/lib/tab-manager/types";

describe("sanitizeMdiContent — blank paragraph conversion", () => {
  it("standalone <br /> on its own line → [[blank]]", () => {
    expect(sanitizeMdiContent("<br />")).toBe("[[blank]]");
  });

  it("standalone <br/> (no space) → [[blank]]", () => {
    expect(sanitizeMdiContent("<br/>")).toBe("[[blank]]");
  });

  it("standalone <BR /> (uppercase) → newline, not [[blank]] (Step 1a is case-sensitive)", () => {
    // Step 1a regex has no 'i' flag, so <BR /> is NOT matched as a blank paragraph.
    // It falls through to Step 1b (/gi) and becomes a newline instead.
    expect(sanitizeMdiContent("<BR />")).toBe("\n");
  });

  it("standalone <br /> with CRLF → [[blank]] + LF", () => {
    // Step 1a matches <br /> and trailing \r, leaving the \n intact
    expect(sanitizeMdiContent("<br />\r\n")).toBe("[[blank]]\n");
  });

  it("<br> inside text → newline (not [[blank]])", () => {
    expect(sanitizeMdiContent("Hello<br>World")).toBe("Hello\nWorld");
  });

  it("blank paragraph in context", () => {
    const input = "A段落\n\n<br />\n\nB段落";
    const result = sanitizeMdiContent(input);
    expect(result).toContain("[[blank]]");
    expect(result).not.toContain("<br");
    expect(result).toBe("A段落\n\n[[blank]]\n\nB段落");
  });
});
