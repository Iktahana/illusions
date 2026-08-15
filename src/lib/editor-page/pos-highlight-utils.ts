import type { Token } from "@/lib/nlp-client/types";

const JAPANESE_GRAPHEME_SEGMENTER = new Intl.Segmenter("ja", { granularity: "grapheme" });

export function getPosHighlightCategory(token: Pick<Token, "pos" | "pos_detail_1">): string {
  if (token.pos === "動詞" && token.pos_detail_1) {
    const detailed = `${token.pos}-${token.pos_detail_1}`;
    if (detailed === "動詞-自立" || detailed === "動詞-非自立") return detailed;
  }
  return token.pos;
}

export function codeUnitOffsetToGraphemeIndex(text: string, offset: number): number {
  if (offset <= 0) return 0;
  let graphemeIndex = 0;
  for (const segment of JAPANESE_GRAPHEME_SEGMENTER.segment(text)) {
    if (segment.index >= offset) break;
    graphemeIndex += 1;
  }
  return graphemeIndex;
}
