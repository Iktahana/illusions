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

describe("sanitizeMdiContent — bracket macro escape recovery (.mdi only)", () => {
  it("(.mdi) serializer-escaped \\[\\[blank]] → [[blank]]", () => {
    expect(sanitizeMdiContent("\\[\\[blank]]", MDI)).toBe("[[blank]]");
  });
  it("(.mdi) already-clean [[blank]] is unchanged (idempotent)", () => {
    expect(sanitizeMdiContent("[[blank]]", MDI)).toBe("[[blank]]");
  });
  it("(.mdi) escaped [[blank]] in context", () => {
    const input = "A段落\n\n\\[\\[blank]]\n\nB段落";
    expect(sanitizeMdiContent(input, MDI)).toBe("A段落\n\n[[blank]]\n\nB段落");
  });
  it("(.mdi) escaped \\[\\[br]] → [[br]]", () => {
    expect(sanitizeMdiContent("行1\\[\\[br]]行2", MDI)).toBe("行1[[br]]行2");
  });
  it("(.mdi) escaped no-break macro → unescaped", () => {
    expect(sanitizeMdiContent("\\[\\[no-break:東京]]", MDI)).toBe("[[no-break:東京]]");
  });
  it("(.mdi) escaped kern macro → unescaped", () => {
    expect(sanitizeMdiContent("\\[\\[kern:0.5em:漢字]]", MDI)).toBe("[[kern:0.5em:漢字]]");
  });
  it("(.mdi) fully-escaped brackets \\[\\[blank\\]\\] → [[blank]]", () => {
    expect(sanitizeMdiContent("\\[\\[blank\\]\\]", MDI)).toBe("[[blank]]");
  });
  it("(.md) escape recovery is skipped (Step 0 is .mdi only)", () => {
    expect(sanitizeMdiContent("\\[\\[blank]]", MD)).toBe("\\[\\[blank]]");
  });
});
