import { describe, it, expect } from "vitest";
import { stripMdiBlankMarkers, MDI_BLANK_RE } from "@/lib/export/mdi-parser";

describe("stripMdiBlankMarkers", () => {
  it("単独 [[blank]] 行を空文字に変換", () => {
    expect(stripMdiBlankMarkers("[[blank]]")).toBe("");
  });
  it("段落間の [[blank]] を空文字に変換し、周囲の改行は維持", () => {
    const input = "A段落\n\n[[blank]]\n\nB段落";
    expect(stripMdiBlankMarkers(input)).toBe("A段落\n\n\n\nB段落");
  });
  it("CRLF: [[blank]]\\r\\n の \\r まで吸収して空文字 + \\n を残す", () => {
    expect(stripMdiBlankMarkers("[[blank]]\r\n")).toBe("\n");
  });
  it("行内の [[blank]] は変換しない", () => {
    expect(stripMdiBlankMarkers("foo [[blank]] bar")).toBe("foo [[blank]] bar");
  });
  it("MDI_BLANK_RE は global + multiline フラグを持つ", () => {
    expect(MDI_BLANK_RE.flags).toBe("gm");
  });
});
