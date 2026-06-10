import { describe, it, expect } from "vitest";
import type { Node } from "@milkdown/prose/model";
import { getParagraphLeadingChar, isDialogueParagraph } from "../plugins/dialogue-indent";

type MockChild = {
  isText: boolean;
  text?: string | null;
  type: { name: string };
  attrs: Record<string, unknown>;
};

function makeParagraph(firstChild: MockChild | null): Node {
  return { firstChild } as unknown as Node;
}

function textChild(text: string): MockChild {
  return { isText: true, text, type: { name: "text" }, attrs: {} };
}

function rubyChild(base: string): MockChild {
  return { isText: false, type: { name: "ruby" }, attrs: { base, text: "" } };
}

describe("getParagraphLeadingChar", () => {
  it("returns the first character of a leading text node", () => {
    expect(getParagraphLeadingChar(makeParagraph(textChild("「あなたは」")))).toBe("「");
  });

  it("returns the first base character of a leading ruby node", () => {
    expect(getParagraphLeadingChar(makeParagraph(rubyChild("花様年華")))).toBe("花");
  });

  it("returns empty string for an empty paragraph", () => {
    expect(getParagraphLeadingChar(makeParagraph(null))).toBe("");
  });

  it("returns empty string for a non-text non-ruby leading node", () => {
    const atom: MockChild = { isText: false, type: { name: "mdibreak" }, attrs: {} };
    expect(getParagraphLeadingChar(makeParagraph(atom))).toBe("");
  });
});

describe("isDialogueParagraph", () => {
  it.each(["「", "『", "（", "〈", "《", "【", "〔"])(
    "treats a paragraph starting with %s as dialogue",
    (bracket) => {
      expect(isDialogueParagraph(makeParagraph(textChild(`${bracket}台詞`)))).toBe(true);
    },
  );

  it("does not treat a normal narrative paragraph as dialogue", () => {
    expect(isDialogueParagraph(makeParagraph(textChild("退勤後、彼はいつも")))).toBe(false);
  });

  it("does not treat closing brackets as dialogue openers", () => {
    expect(isDialogueParagraph(makeParagraph(textChild("」から始まる")))).toBe(false);
  });

  it("does not treat an empty paragraph as dialogue", () => {
    expect(isDialogueParagraph(makeParagraph(null))).toBe(false);
  });

  it("treats a paragraph whose leading ruby base starts with a bracket as dialogue", () => {
    expect(isDialogueParagraph(makeParagraph(rubyChild("「かっこ」")))).toBe(true);
  });
});
