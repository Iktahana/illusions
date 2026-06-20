import kyujitaiData from "kyujitai/data/kyujitai.json";

interface KyujitaiData {
  kyuji: Array<[shinjitai: string, kyujitai: string, variationSelector?: string]>;
}

const SHINJITAI_BY_KYUJITAI = new Map(
  (kyujitaiData as unknown as KyujitaiData).kyuji
    .filter(([shinjitai, kyujitai]) => shinjitai !== kyujitai)
    .map(([shinjitai, kyujitai]) => [kyujitai, shinjitai] as const),
);

// CJK variant characters absent from the kyujitai package that nonetheless
// appear in Japanese text and should be equated in fuzzy search.
// 髙 (U+9AD9) is a common alternate form of 高 (U+9AD8) used in personal names.
const EXTRA_VARIANTS: ReadonlyMap<string, string> = new Map([["髙", "高"]]);

/**
 * Normalizes width, kana script, and old character forms for search comparison.
 * The kyujitai table is maintained by the `kyujitai` package rather than in
 * search logic, so data changes remain independently reviewable.
 */
export function normalizeJapaneseSearchVariants(text: string): string {
  let normalized = "";

  for (const character of text.normalize("NFKC")) {
    const codePoint = character.codePointAt(0) ?? 0;
    const kana =
      codePoint >= 0x30a1 && codePoint <= 0x30f6
        ? String.fromCodePoint(codePoint - 0x60)
        : character;
    const mapped = SHINJITAI_BY_KYUJITAI.get(kana) ?? EXTRA_VARIANTS.get(kana) ?? kana;
    normalized += mapped;
  }

  return normalized;
}
