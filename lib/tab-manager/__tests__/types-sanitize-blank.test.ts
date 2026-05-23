import { describe, it, expect } from "vitest";
import { sanitizeMdiContent } from "@/lib/tab-manager/types";

const MDI = { fileType: ".mdi" as const };
const MD = { fileType: ".md" as const };

describe("sanitizeMdiContent — blank paragraph conversion (.mdi only)", () => {
  it("(.mdi) standalone <br /> → [[blank]]", () => {
    expect(sanitizeMdiContent("<br />", MDI)).toBe("[[blank]]");
  });
  it("(.mdi) standalone <br/> → [[blank]]", () => {
    expect(sanitizeMdiContent("<br/>", MDI)).toBe("[[blank]]");
  });
  it("(.mdi) standalone <br> (no slash) → [[blank]]", () => {
    expect(sanitizeMdiContent("<br>", MDI)).toBe("[[blank]]");
  });
  it("(.mdi) standalone <BR /> uppercase → newline (Step 1a is case-sensitive)", () => {
    expect(sanitizeMdiContent("<BR />", MDI)).toBe("\n");
  });
  it("(.mdi) <br /> with CRLF → [[blank]] + LF", () => {
    expect(sanitizeMdiContent("<br />\r\n", MDI)).toBe("[[blank]]\n");
  });
  it("(.mdi) <br> inside text → newline", () => {
    expect(sanitizeMdiContent("Hello<br>World", MDI)).toBe("Hello\nWorld");
  });
  it("(.mdi) blank paragraph in context", () => {
    const input = "A段落\n\n<br />\n\nB段落";
    expect(sanitizeMdiContent(input, MDI)).toBe("A段落\n\n[[blank]]\n\nB段落");
  });
  it("(.md) standalone <br /> → newline, NOT [[blank]]", () => {
    expect(sanitizeMdiContent("<br />", MD)).toBe("\n");
  });
  it("(.md) blank paragraph in context → no [[blank]] marker", () => {
    const input = "A段落\n\n<br />\n\nB段落";
    const out = sanitizeMdiContent(input, MD);
    expect(out).not.toContain("[[blank]]");
    expect(out).toBe("A段落\n\n\n\n\nB段落");
  });
  it("(no options) defaults to non-.mdi behavior (Step 1a off) — back-compat for unmigrated callers", () => {
    expect(sanitizeMdiContent("<br />")).toBe("\n");
  });
});
